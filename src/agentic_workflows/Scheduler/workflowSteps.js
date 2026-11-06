// Parsing / normalising of an AgentWorkFlow row (GenerativeAIAgents) into
// executable steps.  Pure functions only - no I/O - so they are easy to test.
//
// TaskData (ExecutionJson) is a flat array, e.g.
// [{"id":"step1","name":"...","order":1,"type":"action","dependsOn":"step0",
//   "action":{"module":"reporting","args":{ "channel":"mail", "getquery":"...", ... }}}]

/* ------------------------------------------------------------------ */
/* JSON helpers                                                        */
/* ------------------------------------------------------------------ */

// Text content of an MCP tool result (string | [string, artifact] | content blocks)
export function toText(result) {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    // langchain returns [content, artifact] for content_and_artifact tools
    const first = result[0];
    if (typeof first === "string") return first;
    return result
      .map((b) => (typeof b === "string" ? b : (b?.text ?? "")))
      .join("");
  }
  if (typeof result === "object" && typeof result.text === "string")
    return result.text;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

// Decode a value that may be JSON-encoded several times.
export function parseJsonLoose(value, maxDepth = 4) {
  let data = value;
  for (let i = 0; i < maxDepth && typeof data === "string"; i++) {
    const t = data.trim();
    if (!t) return null;
    try {
      data = JSON.parse(t);
    } catch {
      return null;
    }
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Workflow list (GetAgentWorkFlowDetails result)                      */
/* ------------------------------------------------------------------ */

// GetAgentWorkFlowDetails returns {"sucess":true,"Message":"<json string of list>"}
export function parseWorkflowList(toolResult) {
  const parsed = parseJsonLoose(toText(toolResult));
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (parsed.Message !== undefined) {
    const msg = parseJsonLoose(parsed.Message);
    if (Array.isArray(msg)) return msg;
    if (msg && typeof msg === "object") return [msg];
    return [];
  }
  if (Array.isArray(parsed.Table)) return parsed.Table;
  return typeof parsed === "object" ? [parsed] : [];
}

const pick = (obj, ...names) => {
<<<<<<< HEAD
  for (const n of names)
    if (obj?.[n] !== undefined && obj[n] !== null) return obj[n];
=======
  for (const n of names) if (obj?.[n] !== undefined && obj[n] !== null) return obj[n];
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  return undefined;
};

export function getWorkflowId(row) {
  const id = Number(pick(row, "Id", "id", "GenerativeAIAgentsId", "PId"));
  return Number.isFinite(id) && id > 0 ? id : 0;
}

// false when the row is explicitly disabled / deleted
export function isWorkflowActive(row) {
  const status = pick(row, "Status", "status", "IsActive", "isActive");
  const deleted = pick(row, "IsDeleted", "isDeleted");
  if (deleted === true || deleted === 1 || deleted === "1") return false;
  if (status === false || status === 0 || status === "0") return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

const lowerKeys = (o) =>
<<<<<<< HEAD
  Object.fromEntries(
    Object.entries(o ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
=======
  Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15

function resolvePlaceholders(val, vars) {
  if (typeof val === "string")
    return val.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) =>
      vars[k.toLowerCase()] !== undefined ? String(vars[k.toLowerCase()]) : m,
    );
  if (Array.isArray(val)) return val.map((v) => resolvePlaceholders(v, vars));
  if (val && typeof val === "object")
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => [k, resolvePlaceholders(v, vars)]),
    );
  return val;
}

// "2 Hours" | "30 min" | 5 (minutes) -> ms
export function parseDelayMs(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v * 60_000;
  const m = String(v)
    .trim()
    .toLowerCase()
<<<<<<< HEAD
    .match(
      /^(\d+(?:\.\d+)?)\s*(s|sec\w*|m|min\w*|h|hr\w*|hour\w*|d|day\w*|w|week\w*)?$/,
    );
=======
    .match(/^(\d+(?:\.\d+)?)\s*(s|sec\w*|m|min\w*|h|hr\w*|hour\w*|d|day\w*|w|week\w*)?$/);
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = m[2] || "m";
  if (u.startsWith("s")) return n * 1000;
  if (u.startsWith("h")) return n * 3_600_000;
  if (u.startsWith("d")) return n * 86_400_000;
  if (u.startsWith("w")) return n * 604_800_000;
  return n * 60_000; // m / min / minutes
}

// "YYYY-MM-DD HH:mm" (server local time) -> epoch ms, or null
export function parseScheduleTime(v) {
  if (!v || typeof v !== "string") return null;
  const t = Date.parse(v.trim().replace(" ", "T"));
  return Number.isNaN(t) ? null : t;
}

// Returns { workflowId, name, steps[] } ; steps sorted by order.
export function buildWorkflow(row) {
  const workflowId = getWorkflowId(row);
<<<<<<< HEAD
  const raw = pick(
    row,
    "TaskData",
    "taskData",
    "ExecutionJson",
    "executionJson",
  );
=======
  const raw = pick(row, "TaskData", "taskData", "ExecutionJson", "executionJson");
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  let data = parseJsonLoose(raw);
  if (data && !Array.isArray(data)) data = data.steps ?? data.Steps ?? null;
  if (!Array.isArray(data)) return { workflowId, name: row?.Name, steps: [] };

  const vars = { agentworkflowid: workflowId };

  const steps = data
    .map((s, idx) => {
      const id = s.id ?? `step${s.order ?? idx + 1}`;
      const rawArgs =
<<<<<<< HEAD
        s.action?.args ??
        s.action?.parameters?.args ??
        s.action?.parameters ??
        {};
=======
        s.action?.args ?? s.action?.parameters?.args ?? s.action?.parameters ?? {};
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
      const args = resolvePlaceholders(lowerKeys(rawArgs), vars);

      // dependsOn: "step0" (= the audience root) means "no dependency"
      const depRaw = s.dependsOn ?? s.depends_on;
<<<<<<< HEAD
      const dependsOn = (
        Array.isArray(depRaw) ? depRaw : String(depRaw ?? "").split(",")
      )
=======
      const dependsOn = (Array.isArray(depRaw) ? depRaw : String(depRaw ?? "").split(","))
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
        .map((d) => String(d).trim())
        .filter((d) => d && d !== "step0");

      // channel  : sends a message (mail / sms / whatsapp / rcs / webpush)
      // gate     : holds contacts until a condition is met (dateandtime / addrules)
      // group    : move / add / remove group (not executed by the scheduler yet)
      const control = String(args.controltype ?? "").toLowerCase();
      let kind = "channel";
      if (control === "dateandtime" || control === "addrules") kind = control;
      else if (args.actiontype) kind = "group";
      else if (!args.channel) kind = "unknown";
      // gate nodes carry their contacts under their own pseudo-channel
      if (kind === "dateandtime" || kind === "addrules") args.channel = kind;

      return {
        id,
        name: s.name ?? id,
        order: Number(s.order ?? idx + 1),
        dependsOn,
        module: s.action?.module ?? s.action?.parameters?.module ?? "reporting",
        kind,
        isRoot: dependsOn.length === 0,
        args,
      };
    })
    .sort((a, b) => a.order - b.order);

  return { workflowId, name: row?.Name, steps };
}

/* ------------------------------------------------------------------ */
/* Channel argument spec                                               */
/* ------------------------------------------------------------------ */
// Mirrors CHAN_NEEDS in agent/workflow.edit.js and ChannelSchemas in
// AgentWorkFlow/model/WorkflowExtraArgs.cs - keep the three in sync.
//   required : the step cannot be sent without it (the preview popup fills these)
//   optional : stored when present
export const CHANNEL_ARGS = {
<<<<<<< HEAD
  // NOTHING is mandatory for a channel step: the user may give any of these args or none.
  // Whatever is given is passed to C# (Getcampaignresponsesandsentcontacts) and stored in
  // extraargs; whatever is missing, the sender fills with its defaults.
  mail: {
    required: [],
    optional: [
      "templateid",
      "templatename",
      "campaignid",
      "configurationnameid",
      "istransactional",
      "subject",
      "fromname",
      "fromemailid",
      "replytoemailid",
      "istriggereveryactivity",
      "scheduletime",
    ],
  },
  sms: {
    required: [],
    optional: [
      "templateid",
      "templatename",
      "campaignid",
      "configurationnameid",
      "istransactional",
      "scheduletime",
    ],
  },
  whatsapp: {
    required: [],
    optional: [
      "templateid",
      "templatename",
      "campaignid",
      "configurationnameid",
      "istransactional",
      "scheduletime",
    ],
  },
  rcs: {
    required: [],
    optional: [
      "templateid",
      "templatename",
      "campaignid",
      "configurationnameid",
      "istransactional",
      "scheduletime",
    ],
  },
  webpush: {
    required: [],
    optional: ["templateid", "templatename", "campaignid", "scheduletime"],
  },
  // the timing itself is checked by gates.js (computeGate)
  dateandtime: {
    required: [],
    optional: [
      "datecondition",
      "datevalue",
      "daysofweek",
      "isdynamicgroup",
      "ignoreweekend",
      "scheduletime",
    ],
  },
  // a rule step cannot be evaluated without knowing which rule
=======
  mail: {
    required: ["templateid", "configurationnameid", "subject", "fromname", "fromemailid"],
    optional: ["campaignid", "templatename", "replytoemailid", "istransactional", "istriggereveryactivity", "scheduletime"],
  },
  sms: {
    required: ["templateid", "configurationnameid"],
    optional: ["campaignid", "templatename", "istransactional", "scheduletime"],
  },
  whatsapp: {
    required: ["templateid", "configurationnameid"],
    optional: ["campaignid", "templatename", "istransactional", "scheduletime"],
  },
  rcs: {
    required: ["templateid", "configurationnameid"],
    optional: ["campaignid", "templatename", "istransactional", "scheduletime"],
  },
  // webpush needs no configuration name
  webpush: {
    required: ["templateid"],
    optional: ["campaignid", "templatename", "scheduletime"],
  },
  // the timing itself is checked by gates.js (computeGate), with a clearer message
  dateandtime: {
    required: [],
    optional: ["datecondition", "datevalue", "daysofweek", "isdynamicgroup", "ignoreweekend", "scheduletime"],
  },
  // rule node: satisfy / notsatisfy branches (mirrors findIncomplete in workflow.edit.js)
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  addrules: {
    required: ["ruleid"],
    optional: ["issplittester"],
  },
};

const isBlank = (v) =>
<<<<<<< HEAD
  v === undefined ||
  v === null ||
  v === "" ||
  v === 0 ||
  v === "0" ||
=======
  v === undefined || v === null || v === "" || v === 0 || v === "0" ||
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  (typeof v === "string" && (v.trim() === "" || /^\{\{.*\}\}$/.test(v.trim())));

// templateid may be absent when templatename is given: the MCP tool resolves it.
export function validateStepArgs(step) {
  const spec = CHANNEL_ARGS[step.args.channel];
  if (!spec) return { ok: true, missing: [] };

  const missing = spec.required.filter((k) => {
    if (k === "templateid" && !isBlank(step.args.templatename)) return false;
    return isBlank(step.args[k]);
  });
  return { ok: missing.length === 0, missing };
}

/* ------------------------------------------------------------------ */
/* Tool input                                                          */
/* ------------------------------------------------------------------ */

// Args that have a dedicated parameter on Getcampaignresponsesandsentcontacts.
// Everything else travels in `extraArgs` and is stored per contact row.
const CORE_KEYS = [
  "channel",
  "eventname",
  "getquery",
  "campaignname",
  "campaignid",
  "agentworkflowid",
  "agenttaskid",
  "templatename",
  "templateid",
  "taskrepeatedvalues",
  "getreposechannel",
  "groupname",
  "stepid", // set by the scheduler: the step's OWN id
];
// Canvas / routing / condition bookkeeping - never a send setting, never stored per contact.
const ROUTING_KEYS = [
<<<<<<< HEAD
  "type",
  "isworkflow",
  "actiontype",
  "controltype",
  "datecondition",
  "datevalue",
  "daysofweek",
  "isdynamicgroup",
  "ignoreweekend",
=======
  "type", "isworkflow", "actiontype", "controltype",
  "datecondition", "datevalue", "daysofweek", "isdynamicgroup", "ignoreweekend",
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
];

// parameter names exactly as the C# tool exposes them
const TOOL_PARAM = {
  eventname: "eventName",
  campaignname: "campaignName",
};

<<<<<<< HEAD
const SOURCE_KEYS = [
  "getquery",
  "getreposechannel",
  "eventname",
  "agenttaskid",
  "groupname",
];
=======
const SOURCE_KEYS = ["getquery", "getreposechannel", "eventname", "agenttaskid", "groupname"];
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15

/**
 * A date & time step stores NO contacts: it only pauses. So a step that comes after it
 * reads its contacts from wherever the date step reads them (its query, or its parent's
 * event), walking through several date steps in a row if needed.
 *   Audience -> [Date] -> Mail                  Mail uses the date step's getquery
 *   Mail -(opened)-> [Date] -> SMS              SMS uses mail:opened of the mail step
 *   Rule -(satisfy)-> [Date] -> [Date] -> SMS   SMS uses addrules:satisfy of the rule step
 */
export function resolveSourceArgs(step, wf) {
  const a = { ...step.args };
  let gate = step;
  while (String(a.getreposechannel ?? "").toLowerCase() === "dateandtime") {
    const parentId = gate.dependsOn.at(-1);
    gate = wf.steps.find((s) => s.id === parentId);
    if (!gate || gate.kind !== "dateandtime") break;
    for (const k of SOURCE_KEYS) delete a[k];
<<<<<<< HEAD
    for (const k of SOURCE_KEYS)
      if (gate.args[k] !== undefined) a[k] = gate.args[k];
=======
    for (const k of SOURCE_KEYS) if (gate.args[k] !== undefined) a[k] = gate.args[k];
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
    // a root date step reads by query: the child becomes a query step under its own id
    if (!a.getreposechannel) a.agenttaskid = step.id;
  }
  return a;
}

export function buildToolInput(step, wf) {
  const a = resolveSourceArgs(step, wf);
  a.stepid = step.id; // agenttaskid is the PARENT's id for a child step; stepid is its own
  const input = {};
  for (const k of CORE_KEYS) {
    if (a[k] === undefined || a[k] === null || a[k] === "") continue;
    const p = TOOL_PARAM[k] ?? k;
<<<<<<< HEAD
    input[p] =
      k === "taskrepeatedvalues"
        ? a[k] === true || a[k] === "true"
        : String(a[k]);
=======
    input[p] = k === "taskrepeatedvalues" ? a[k] === true || a[k] === "true" : String(a[k]);
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  }
  input.agentworkflowid = String(wf.workflowId);
  input.agenttaskid = String(a.agenttaskid || step.id);

<<<<<<< HEAD
  // every other arg the step has goes to C# as it is (nothing required, nothing invented);
  // empty values are left out so they are not stored as "" / null
  const extra = {};
  for (const [k, v] of Object.entries(a)) {
    if (CORE_KEYS.includes(k) || ROUTING_KEYS.includes(k)) continue;
    if (
      v === undefined ||
      v === null ||
      (typeof v === "string" && v.trim() === "")
    )
      continue;
    extra[k] = v;
  }
=======
  const extra = {};
  for (const [k, v] of Object.entries(a))
    if (!CORE_KEYS.includes(k) && !ROUTING_KEYS.includes(k)) extra[k] = v;
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  input.extraArgs = JSON.stringify(extra);
  return input;
}

/* ------------------------------------------------------------------ */
/* Date & time condition tool input / reply                            */
/* ------------------------------------------------------------------ */

<<<<<<< HEAD
const CONDITION_KEYS = [
  "datecondition",
  "datevalue",
  "daysofweek",
  "isdynamicgroup",
  "ignoreweekend",
];
=======
const CONDITION_KEYS = ["datecondition", "datevalue", "daysofweek", "isdynamicgroup", "ignoreweekend"];
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15

// The step(s) that come right after a step in this workflow's TaskData.
export function nextStepIdsOf(step, wf) {
  return wf.steps.filter((s) => s.dependsOn.includes(step.id)).map((s) => s.id);
}

// SaveAgentWorkFlowCondition input. status 2 = the window is already over when it starts.
// nextstepids = the step(s) the condition scheduler triggers when this condition is released.
export function buildConditionInput(step, wf, gate) {
  const cond = {};
<<<<<<< HEAD
  for (const k of CONDITION_KEYS)
    if (step.args[k] !== undefined) cond[k] = step.args[k];
=======
  for (const k of CONDITION_KEYS) if (step.args[k] !== undefined) cond[k] = step.args[k];
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  return {
    nextstepids: nextStepIdsOf(step, wf).join(","),
    agentworkflowid: String(wf.workflowId),
    stepid: step.id,
    conditionArgs: JSON.stringify(cond),
    dueatutc: new Date(gate.closed ? Date.now() : gate.dueAt).toISOString(),
    expireatutc: gate.expireAt ? new Date(gate.expireAt).toISOString() : "",
    status: gate.closed ? 2 : 0,
  };
}

// One condition row as returned by the condition tools.
export function normalizeCondition(row) {
  // field names may arrive as AgentWorkFlowId, agentWorkFlowId or agentworkflowid
  // (the MCP C# SDK serialises camelCase, PostgreSQL returns lowercase)
<<<<<<< HEAD
  const lower = Object.fromEntries(
    Object.entries(row ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const pickv = (...n) => {
    for (const k of n) {
      const v = lower[k.toLowerCase()];
      if (v !== undefined && v !== null) return v;
    }
  };
=======
  const lower = Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const pickv = (...n) => { for (const k of n) { const v = lower[k.toLowerCase()]; if (v !== undefined && v !== null) return v; } };
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  // "…Z", "…+05:30", "…+00" are absolute; a value without an offset is UTC (SQL Server DATETIME2)
  const ms = (v) => {
    if (!v) return null;
    const s = String(v).trim().replace(" ", "T");
<<<<<<< HEAD
    return Date.parse(
      /(Z|[+-]\d\d(:?\d\d)?)$/.test(s)
        ? s.replace(/([+-]\d\d)$/, "$1:00")
        : `${s}Z`,
    );
=======
    return Date.parse(/(Z|[+-]\d\d(:?\d\d)?)$/.test(s) ? s.replace(/([+-]\d\d)$/, "$1:00") : `${s}Z`);
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  };
  return {
    id: Number(pickv("Id", "id") ?? 0),
    workflowId: Number(pickv("AgentWorkFlowId", "agentworkflowid") ?? 0),
    stepId: String(pickv("StepId", "stepid") ?? ""),
    status: Number(pickv("Status", "status") ?? 0), // 0 waiting, 1 released, 2 expired
    dueAt: ms(pickv("DueAt", "dueat")),
    expireAt: ms(pickv("ExpireAt", "expireat")),
    releasedAt: ms(pickv("ReleasedAt", "releasedat")),
<<<<<<< HEAD
    nextStepIds: String(pickv("NextStepIds", "nextstepids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
=======
    nextStepIds: String(pickv("NextStepIds", "nextstepids") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  };
}

// {Status, Message, Data: row | rows}
export function parseConditionReply(toolResult) {
  const obj = parseJsonLoose(toText(toolResult));
<<<<<<< HEAD
  if (!obj || typeof obj !== "object")
    return {
      ok: false,
      message: "empty response from condition tool",
      rows: [],
    };
  const st = obj.Status ?? obj.status;
  const ok = st === true || String(st).toLowerCase() === "true";
  const data = parseJsonLoose(obj.Data ?? obj.data) ?? obj.Data ?? obj.data;
  const rows = (Array.isArray(data) ? data : data ? [data] : []).map(
    normalizeCondition,
  );
=======
  if (!obj || typeof obj !== "object") return { ok: false, message: "empty response from condition tool", rows: [] };
  const st = obj.Status ?? obj.status;
  const ok = st === true || String(st).toLowerCase() === "true";
  const data = parseJsonLoose(obj.Data ?? obj.data) ?? obj.Data ?? obj.data;
  const rows = (Array.isArray(data) ? data : data ? [data] : []).map(normalizeCondition);
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  return { ok, message: obj.Message ?? obj.message ?? "", rows };
}

// Tool replies are JSON text: {Status,Message,Channel,Total,Saved,Skipped,Data}
export function parseToolReply(toolResult) {
  const text = toText(toolResult);
  const obj = parseJsonLoose(text);
  if (!obj || typeof obj !== "object") {
    return { ok: false, message: text || "empty response from tool" };
  }
<<<<<<< HEAD
  const st =
    obj.Status ?? obj.status ?? obj.Success ?? obj.success ?? obj.sucess;
=======
  const st = obj.Status ?? obj.status ?? obj.Success ?? obj.success ?? obj.sucess;
>>>>>>> 6bd823945e44482af2e6705b51eac15b10560a15
  const ok = st === true || String(st).toLowerCase() === "true";
  return {
    ok,
    message: obj.Message ?? obj.message ?? "",
    total: Number(obj.Total ?? obj.total ?? 0),
    saved: Number(obj.Saved ?? obj.saved ?? 0),
    skipped: Number(obj.Skipped ?? obj.skipped ?? 0),
    needsAccount: String(obj.Status ?? "").toUpperCase() === "ACTION_REQUIRED",
  };
}
