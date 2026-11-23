/*
 * Contacts of a workflow, shown with the reporting tool (GetReport).
 *
 * The audience text of the workflow (the root "Audience" block, e.g.
 * "contacts from Bangalore") is passed to GetReport exactly like a reporting
 * question, and the result is returned in the SAME shape as the reporting module:
 *
 *   toolmessage: {
 *     dbdata:       "[{...},{...}]"   // JSON string of the contact rows (same as reporting)
 *     query:        "SELECT ..."      // the SQL GetReport ran (same as reporting)
 *     contactcount: 1250              // number of contacts (null when unknown)
 *     audience:     "contacts from Bangalore",
 *     source:       "GetReport"
 *   }
 *
 * So the UI can show the contact table for module "workflow" the same way it does
 * for module "reporting".
 */
import { findReportTool, runReport } from "../../utils/report.helper.js";

const CACHE_MS = 10 * 60_000; // same audience within 10 min: reuse, don't run the report again

const toText = (c) =>
  typeof c === "string"
    ? c
    : Array.isArray(c)
      ? c.map((b) => (typeof b === "string" ? b : (b?.text ?? ""))).join("")
      : String(c ?? "");

const COUNT_KEYS = ["totalcount", "total", "totalcontacts", "contactcount", "count"];
const isCountKey = (k) => COUNT_KEYS.includes(String(k).toLowerCase().replace(/[\s_()*]/g, ""));

const toCount = (v) => {
  const s = String(v ?? "").trim().replace(/,/g, "");
  return /^\d+$/.test(s) ? Number(s) : null;
};

/**
 * The audience text of the workflow: the Value of the root block (first node),
 * e.g. "contacts from Bangalore". For a saved-group audience ("12,15") the root
 * step's getquery, else "contacts in saved groups with IDs 12,15".
 */
export function getAudienceQuery(workflow) {
  const rootId = workflow?.flowchartConfig?.nodes?.[0]?.blockId;
  if (!rootId) return "";

  const audience = Array.isArray(workflow.configarray)
    ? workflow.configarray.find((item) => item?.Channel === rootId)
    : null;
  const value = String(audience?.Value ?? "").trim();
  if (!value) return "";

  if (/^\d+(\s*,\s*\d+)*$/.test(value)) {
    const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
    const rootStep = steps.find(
      (step) =>
        step?.action?.args?.groupids !== undefined ||
        (step?.dependsOn === "step0" && step?.action?.args?.getquery),
    );
    const existingQuery = String(rootStep?.action?.args?.getquery ?? "").trim();
    if (existingQuery) return existingQuery;
    const groupIds = String(rootStep?.action?.args?.groupids ?? value).trim();
    return `contacts in saved groups with IDs ${groupIds}`;
  }

  return value;
}

/**
 * The count inside a text answer from GetReport.
 *   '**Total contacts in the group "Test_Surekha_15_sptt": 1.**'  -> 1   (not 15)
 *   '**Total contacts: 338,183.**'                               -> 338183
 *   'There are 1,250 contacts in 2024_leads'                     -> 1250 (not 2024)
 *   'There is no available data'                                 -> null
 * Numbers inside quotes or glued to a name (abc_15_x, v2) are not counts.
 */
export function countFromAnswer(text) {
  const t = String(text ?? "")
    .replace(/\\"/g, '"')
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, " "); // quoted names out
  // 1) the number right after a colon: "...: 1", "...: **1,250**"
  const afterColon = t.match(/:\s*\**\s*(\d[\d,]*)(?![\w])/);
  if (afterColon) return toCount(afterColon[1]);
  // 2) else the last number that stands on its own (not part of a word)
  const standalone = [...t.matchAll(/(?<![\w])(\d[\d,]*)(?![\w])/g)];
  return standalone.length ? toCount(standalone.at(-1)[1]) : null;
}

export const formatCount = (n) => Number(n).toLocaleString("en-IN");

/**
 * The text sent to GetReport: the workflow's audience content as it is.
 * When the content does not say what to list, "Show contacts" is put in front,
 * so GetReport returns contact rows (e.g. "from Bangalore" -> "Show contacts from Bangalore").
 */
export function buildContactsQuestion(audience) {
  const text = String(audience ?? "").trim();
  if (/\b(contacts?|leads?|customers?|users?|people|members?|subscribers?)\b/i.test(text)) {
    return text;
  }
  return `Show contacts ${text}`;
}

/**
 * Runs GetReport for the workflow audience.
 * @returns null when the workflow has no audience yet, else
 *   { ok, audience, getquery, dbdata, query, contactcount, rows, answer, error }
 */
export async function getWorkflowContacts({ wf, tools, session, force = false }) {
  const audience = getAudienceQuery(wf);
  if (!audience) return null;

  const cached = session?.wfContacts;
  if (
    !force &&
    cached?.audience === audience &&
    Date.now() - (cached.at ?? 0) < CACHE_MS
  ) {
    return { ...cached, cached: true };
  }

  const result = await runContactsReport({
    audience,
    getquery: buildContactsQuestion(audience),
    tools,
  });
  if (session && result.ok) session.wfContacts = { ...result, rows: undefined }; // keep the session light
  return result;
}

const REWRITE_PROMPT = `You turn the user's latest message into ONE standalone question for a reporting database of contacts.

Rules:
- The latest message may refer to something named earlier in the conversation ("the group", "this group", "them", "those contacts", "that audience", "there"). Replace the reference with the exact name or filter the user gave earlier: group name, list, segment, city, tag, date range, etc.
- Copy names exactly as the user wrote them (same spelling, case, underscores). Do not invent names, IDs or filters.
- Keep what the user asked for: a count stays a count ("How many contacts are in the group X?"), a list stays a list ("Show the contacts in the group X").
- Use only what the USER said. Ignore what the assistant suggested.
- If nothing earlier is referred to, return the latest message unchanged.
- Reply with the question only: no quotes, no explanation, no SQL.`;

/**
 * The question sent to GetReport when there is no workflow yet. The latest message
 * often points back ("how many contacts are there in the group"), so the LLM makes it
 * standalone from the conversation: "How many contacts are in the group Test_Surekha_15_sptt?".
 * Without an LLM (or when it fails) the message is used as it is.
 */
export async function standaloneQuestion({ llmModel, history, question }) {
  const text = toText(question).trim();
  if (!llmModel || !Array.isArray(history) || history.length < 2) return text;

  const convo = history
    .slice(-12, -1)
    .map((m) => `${String(m.role).toUpperCase()}: ${toText(m.content).slice(0, 600)}`)
    .join("\n");
  try {
    const res = await llmModel.invoke([
      { role: "system", content: REWRITE_PROMPT },
      { role: "user", content: `CONVERSATION:\n${convo}\n\nLATEST MESSAGE:\n${text}` },
    ]);
    const out = toText(res?.content)
      .replace(/^```\w*|```$/g, "")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .trim();
    // a real question back, not an answer / SQL / essay
    if (out && out.length <= 300 && !/^\s*(select|with)\b/i.test(out) && !out.includes("\n")) {
      if (out !== text) console.log(`[workflow contacts] question: "${text}" -> "${out}"`);
      return out;
    }
  } catch (err) {
    console.error("[workflow contacts] question rewrite failed:", err.message);
  }
  return text;
}

/**
 * No workflow yet: the user's question (made standalone from the conversation)
 * goes to GetReport, like the reporting module.
 * "how many are there?" with nothing named -> "How many contacts are there?"
 */
export async function getContactsForQuestion({ question, tools, llmModel, history }) {
  let getquery = await standaloneQuestion({ llmModel, history, question });
  if (!new RegExp(`\\b${WHO}\\b`, "i").test(getquery) && !/\bgroups?\b/i.test(getquery)) {
    getquery = "How many contacts are there?";
  }
  return runContactsReport({ audience: getquery, getquery, tools });
}

async function runContactsReport({ audience, getquery, tools }) {
  const base = { audience, getquery, dbdata: JSON.stringify([]), query: "", contactcount: null, rows: [] };

  const reportTool = findReportTool(tools);
  if (!reportTool) {
    return { ...base, ok: false, error: "GetReport tool not found." };
  }

  try {
    const r = await runReport(reportTool, getquery);
    if (!r.success) {
      return { ...base, query: r.query, ok: false, error: r.rawMessage && !r.query ? r.rawMessage : "The report could not be generated." };
    }

    const rows = Array.isArray(r.rows) ? r.rows : [];
    let contactcount = null;
    const first = rows[0];
    if (first && typeof first === "object") {
      const keys = Object.keys(first);
      // a TotalCount-like column
      let key = keys.find(isCountKey);
      // one row with one number, e.g. [{ "NumberOfContacts": 1250 }]: that is the count
      if (!key && rows.length === 1 && keys.length === 1 && toCount(first[keys[0]]) !== null) {
        key = keys[0];
      }
      if (key) contactcount = toCount(first[key]);
      // a single count row: nothing to list as details
      if (key && keys.length === 1 && rows.length === 1) rows.length = 0;
    }
    // no count column: the number of contact rows returned
    if (contactcount === null && r.rows) contactcount = rows.length;
    // the answer came as text, e.g. "**Total contacts: 1,250**"
    if (contactcount === null && r.answer) {
      contactcount = countFromAnswer(r.answer);
    }

    return {
      ...base,
      ok: true,
      rows,
      answer: r.answer,
      query: r.query,
      dbdata: JSON.stringify(rows),
      contactcount,
      at: Date.now(),
    };
  } catch (err) {
    console.error("[workflow contacts] GetReport failed:", err);
    return { ...base, ok: false, error: "The contact list could not be loaded right now." };
  }
}

/**
 * The toolmessage for the UI.
 *  - default (count only): { contactcount, audience, source } - no dbdata, so no table
 *  - withDetails: also dbdata + query, the same keys as the reporting module (table)
 */
export function contactsToolMessage(c, { withDetails = false } = {}) {
  if (!c) return undefined;
  const msg = {
    contactcount: c.contactcount ?? null,
    audience: c.audience,
    source: "GetReport",
  };
  if (withDetails) {
    msg.dbdata = c.dbdata ?? JSON.stringify([]);
    msg.query = c.query ?? "";
  }
  return msg;
}

/** The chat wording: "Total count: 1,250" (nothing else). */
export function contactsLine(c) {
  if (!c) return "";
  if (!c.ok || c.contactcount === null) return "Total count: not available";
  return `Total count: ${formatCount(c.contactcount)}`;
}

/** Puts the line just above the final save question (or at the end). */
export function insertLine(message, line) {
  const text = toText(message);
  if (!line) return text;
  const lines = text.split("\n");
  let at = lines.findIndex((l) => /^\s*(Would you like|Do you want)/i.test(l));
  if (at > 0) {
    const note = lines.slice(0, at).findLastIndex((l) => /^Some settings are still missing/i.test(l.trim()));
    if (note > 0) at = note;
    lines.splice(at, 0, line);
    return lines.join("\n");
  }
  return `${text}\n${line}`;
}

const WHO = "(?:contacts?|audience|people|users?|leads?|recipients?|members?|customers?)";

function looksLikeInstruction(t) {
  // "send a mail to contacts from Pune" is a workflow instruction, not a question
  const startsAsQuestion = /^(?:show|list|view|display|see|get|fetch|give|tell|what|which|who|how\s+many|can\s+you|could\s+you|please)\b/.test(t);
  return (
    !startsAsQuestion &&
    /\b(?:send|add|move|remove|delete|create|schedule|wait|change|replace|rename|save|update|set)\b/.test(t)
  );
}

/** "how many contacts?", "contact count", "total contacts" -> show the count only */
export function isContactCountQuestion(text) {
  const t = toText(text).toLowerCase().trim();
  if (!t || t.length > 200 || looksLikeInstruction(t)) return false;
  // "how many are there?", "how many?" - but not "how many steps / mails / days ..."
  if (
    /\bhow\s+many\b/.test(t) &&
    !/\bhow\s+many\s+(?:\w+\s+)?(?:steps?|nodes?|blocks?|mails?|emails?|sms|messages?|templates?|workflows?|days?|hours?|minutes?|times?|rules?|branch(?:es)?)\b/.test(t)
  ) {
    return true;
  }
  return (
    new RegExp(`\\bhow\\s+many\\s+(?:\\w+\\s+){0,2}${WHO}\\b`).test(t) ||
    /\bhow\s+many\b.{0,40}\b(?:get|receive|reach|match|be\s+sent)\b/.test(t) ||
    new RegExp(`\\b${WHO}\\s+(?:count|size|total)\\b`).test(t) ||
    new RegExp(`\\b(?:total|number\\s+of|count\\s+of)\\s+(?:the\\s+)?${WHO}\\b`).test(t) ||
    /^(?:what(?:'s| is)\s+the\s+)?count\s*\??$/.test(t)
  );
}

/**
 * "show the contacts", "list the audience", "contact details", "who will get this"
 * -> show the count AND the contact details (table).
 * A count question ("show the contact count") is not a details request.
 */
export function isContactDetailsRequest(text) {
  const t = toText(text).toLowerCase().trim();
  if (!t || t.length > 200 || looksLikeInstruction(t)) return false;
  if (/\b(?:count|how\s+many|total|number\s+of|size)\b/.test(t) && !/\b(?:details?|list)\b/.test(t)) {
    return false;
  }
  return (
    new RegExp(`^(?:can\\s+you\\s+|could\\s+you\\s+|please\\s+)?(?:show|list|view|display|see)\\b.{0,30}\\b${WHO}\\b`).test(t) ||
    new RegExp(`\\b${WHO}\\s+(?:details?|list)\\b`).test(t) ||
    new RegExp(`\\b(?:details?|list)\\s+of\\s+(?:the\\s+)?${WHO}\\b`).test(t) ||
    /^(?:show|give|see)\s+(?:me\s+)?(?:the\s+)?details\b/.test(t) ||
    /\bwho\s+(?:will|would|are)\b.{0,30}\b(?:get|receive|in)\b/.test(t)
  );
}
