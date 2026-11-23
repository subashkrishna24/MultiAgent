/*
 * GetReport helpers, shared by the reporting module and the workflow contact list.
 * (moved here from workflow.orchestrator.js, unchanged)
 */

const toText = (c) =>
  typeof c === "string"
    ? c
    : Array.isArray(c)
      ? c.map((b) => (typeof b === "string" ? b : (b?.text ?? ""))).join("")
      : String(c ?? "");

export function parseReportResult(raw) {
  let v = raw;
  if (Array.isArray(v) && v.length === 2 && !v[0]?.type) v = v[0]; // [content, artifact]
  if (
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !("content" in v) &&
    !("text" in v)
  ) {
    return v;
  }
  const parsed = decodeDeep(toText(v?.content ?? v));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : { Message: String(parsed ?? "") };
}

// Unwraps values escaped several times: "\"**text**\"" -> **text**, "[{...}]" -> array
export function decodeDeep(value) {
  let v = value;
  for (let i = 0; i < 5 && typeof v === "string"; i++) {
    const s = v.trim();
    let next;
    try {
      next = JSON.parse(s);
    } catch {
      if (!s.startsWith('\\"')) break;
      try {
        next = JSON.parse(`"${s}"`);
      } catch {
        break;
      } // \"text\" -> "text"
    }
    if (typeof next !== "string" && typeof next !== "object") break; // keep "10" as text
    if (next === v) break;
    v = next;
  }
  return typeof v === "string" ? v.trim() : v;
}

export function isSqlText(s) {
  return /^\s*(select|with|insert|update|delete)\b/i.test(s || "");
}

export function findReportTool(...toolLists) {
  for (const tools of toolLists) {
    const tool = (tools || []).find(
      (t) => t.name === "GetReport" || String(t.name).endsWith("__GetReport"),
    );
    if (tool) return tool;
  }
  return null;
}

/**
 * Calls GetReport with a text question and returns what the UI needs.
 *   { success, rows (array | null), answer (text | ""), query (SQL | ""), rawMessage }
 *  - rows:   the result table when GetReport returned rows
 *  - answer: the answer text when GetReport returned text instead of rows
 */
export async function runReport(reportTool, getquery) {
  const raw = await reportTool.invoke({ getquery, type: 1 });
  console.log("[GetReport] raw output:", typeof raw, raw);

  const result = parseReportResult(raw);
  const get = (...keys) =>
    keys.map((k) => result?.[k]).find((v) => v !== undefined && v !== null);

  const success = [true, "true", 1, "1"].includes(
    get("success", "sucess", "Success", "Sucess", "isSuccess", "IsSuccess"),
  );

  // Message is sometimes the SQL, sometimes a real message
  const rawMessage = toText(get("Message", "message")).trim();
  const query = isSqlText(rawMessage) ? rawMessage : "";

  // dbdata is sometimes rows, sometimes the answer text (escaped several times)
  const data = decodeDeep(get("dbdata", "dbData", "DbData", "Dbdata"));

  let rows = null;
  let answer = "";
  if (success && Array.isArray(data)) {
    rows = data;
  } else if (success && data && typeof data === "object") {
    const r = data.rows ?? data.Rows ?? data.data ?? data.Data;
    rows = Array.isArray(r) ? r : [data];
  } else if (success && data !== undefined && data !== null && String(data).trim() !== "") {
    answer = String(data).trim();
  }

  return { success, rows, answer, query, rawMessage };
}
