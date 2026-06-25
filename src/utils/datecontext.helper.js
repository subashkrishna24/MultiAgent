export function getDateContext() {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentYear = now.getFullYear();

    // Last week calculation
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(now.getDate() - 7);
    const lastWeekStartStr = lastWeekStart.toISOString().split("T")[0];

    const lastWeekEnd = new Date(now);
    lastWeekEnd.setDate(now.getDate() - 1);
    const lastWeekEndStr = lastWeekEnd.toISOString().split("T")[0];

    return `
REAL TIME DATE CONTEXT:

Today:
${today}

Current Year:
${currentYear}


DYNAMIC DATE RESOLUTION RULES (GLOBAL):

1. BASE CALCULATIONS:
Use the provided reference Today's date (${today}) to dynamically calculate the targeted calendar date(s) for any relative time expressions mentioned by the user (e.g., "today", "yesterday", "tomorrow", "last week", "next month", "this month").

2. MANDATORY TIME-BOUND EXPANSION (FOR ALL TOOLS & QUERIES):
Whenever parsing dates for any module, tool parameters, filtering windows, or backend queries, you MUST always expand a single calendar date into a complete 24-hour timestamp range. Never use a raw YYYY-MM-DD format without time.
- Start Boundary: Always append 00:00:00 to the calculated start date.
- End Boundary: Always append 23:59:59 to the calculated end date.

3. DYNAMIC RANGE MAPPING REFERENCE:
As a calculation reference using Today (${today}):
- If the resolved period is a single day (e.g., "today"):
  Start: ${today} 00:00:00 | End: ${today} 23:59:59
- If the resolved period is the previous 7 days (e.g., "last week"):
  Start: ${lastWeekStartStr} 00:00:00 | End: ${lastWeekEndStr} 23:59:59

4. STRING FORMAT CONTROL:
- All temporal arguments provided to backend execution tools or query parameters must strictly follow the "YYYY-MM-DD HH:mm:ss" structural schema.

5. HYPOTHETICAL GUARDRAILS:
- Do not derive current execution date contexts from historical conversation history logs.
- Forward-looking operations must verify that target times reside chronologically in the future relative to the current system time.
`;
}