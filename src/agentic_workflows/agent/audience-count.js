const isCount = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const count = Number(value.trim());
    return Number.isSafeInteger(count) ? count : null;
  }
  return null;
};

function decode(value, depth = 0) {
  if (depth > 6) return value;
  if (typeof value === "string") {
    try {
      return decode(JSON.parse(value), depth + 1);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map((item) => decode(item, depth + 1));
  if (value && typeof value === "object") {
    if (typeof value.text === "string" && Object.keys(value).length <= 2) {
      return decode(value.text, depth + 1);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, decode(item, depth + 1)]),
    );
  }
  return value;
}

function findCount(value) {
  const pending = [decode(value)];
  while (pending.length) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!current || typeof current !== "object") continue;
    for (const [key, item] of Object.entries(current)) {
      if (["totalcount", "total"].includes(key.toLowerCase())) {
        const count = isCount(item);
        if (count !== null) return count;
      }
      if (item && typeof item === "object") pending.push(item);
    }
  }
  return null;
}

function getAudienceQuery(workflow) {
  const rootId = workflow?.flowchartConfig?.nodes?.[0]?.blockId;
  if (!rootId) return "";

  const audience = workflow.configarray?.find((item) => item.Channel === rootId);
  const value = String(audience?.Value ?? "").trim();
  if (!value) return "";

  if (/^\d+(\s*,\s*\d+)*$/.test(value)) {
    const rootStep = workflow.steps?.find(
      (step) =>
        step.action?.args?.groupids !== undefined ||
        (step.dependsOn === "step0" && step.action?.args?.getquery),
    );
    const existingQuery = String(rootStep?.action?.args?.getquery ?? "").trim();
    if (existingQuery) return existingQuery;
    const groupIds = String(rootStep?.action?.args?.groupids ?? value).trim();
    return `contacts in saved groups with IDs ${groupIds}`;
  }

  return value;
}

function buildWorkflowAudienceReportQuery(audienceQuery) {
  return `Get the total contact count and up to 10 sample contact details for this workflow audience: ${audienceQuery}. Return the complete matching total as TotalCount; do not calculate it from the sample rows.`;
}

function getReportTool(tools) {
  return tools.find(
    (tool) => tool.name === "GetReport" || tool.name.endsWith("__GetReport"),
  );
}

function parseReportResponse(raw) {
  let value = raw;
  if (Array.isArray(value) && value.length === 2 && !value[0]?.type) {
    value = value[0];
  }
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !("content" in value) &&
    !("text" in value)
  ) {
    return value;
  }

  const content = value?.content ?? value?.text ?? value;
  const parsed = decode(
    Array.isArray(content)
      ? content.map((item) => item?.text ?? "").join("")
      : content,
  );
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : {};
}

function getReportRows(result) {
  const data = decode(
    result.dbdata ?? result.dbData ?? result.DbData ?? result.Dbdata,
  );
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const rows = data.rows ?? data.Rows ?? data.data ?? data.Data;
  if (Array.isArray(rows)) return rows;
  return Object.keys(data).length ? [data] : [];
}

export async function getWorkflowAudienceContactReport({ workflow, tools }) {
  const audienceQuery = getAudienceQuery(workflow);
  const unavailable = (message) => ({
    status: "unavailable",
    count: null,
    contacts: [],
    audienceQuery,
    query: null,
    message,
  });

  if (!audienceQuery) {
    return unavailable("The workflow audience is not available for reporting.");
  }

  const reportTool = getReportTool(tools);
  if (!reportTool) {
    return unavailable("The GetReport MCP tool is unavailable.");
  }

  const query = buildWorkflowAudienceReportQuery(audienceQuery);
  try {
    const raw = await reportTool.invoke({ getquery: query, type: 1 });
    const result = parseReportResponse(raw);
    const rows = getReportRows(result);
    const count = findCount(rows);
    const success = [
      true,
      "true",
      1,
      "1",
    ].includes(
      result.success ??
        result.sucess ??
        result.Success ??
        result.Sucess ??
        result.isSuccess ??
        result.IsSuccess,
    );

    if (!success || count === null) {
      return {
        ...unavailable(
          count === null
            ? "GetReport did not return an authoritative contact count."
            : "GetReport could not retrieve audience contact details.",
        ),
        query,
      };
    }

    return {
      status: "available",
      count,
      contacts: rows,
      audienceQuery,
      query,
      source: "GetReport",
      measuredAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[workflow audience report] lookup failed:", error);
    return {
      ...unavailable("The audience report lookup failed."),
      query,
    };
  }
}

export function getContactCountMetadata(response, audienceQuery = "") {
  const messages = response?.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!/(?:^|__)GetContacts$/i.test(message?.name ?? "")) continue;
    const count = findCount(message.content);
    if (count === null) continue;
    return {
      status: "available",
      count,
      audienceQuery,
      source: "MCP",
      measuredAt: new Date().toISOString(),
    };
  }
  return null;
}
