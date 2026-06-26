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


GLOBAL TIME-HORIZON RESOLUTION RULES (ALL MODULES):

1. BASE CALCULATIONS:
Use Today's reference date (${today}) as the baseline anchor to evaluate any time-descriptor context used by the user.

2. THE "UPCOMING / FUTURE" HORIZON RULE:
When the user requests anything relative to the future (e.g., "upcoming", "scheduled", "future", "next", "active forecasts"), you must map the time window from the current moment stretching forward indefinitely:
- Start Date/Time: ${today} 00:00:00 (or the exact current time)
- End Date/Time: 2099-12-31 23:59:59 (Use this maximum future date to capture all upcoming data)

3. THE "PAST / HISTORICAL" HORIZON RULE:
When the user requests historical summaries or synopsis data across the past (e.g., "past", "previous", "historical", "sent", "completed", "old logs"), you must map the time window from the beginning of data collection up until the end of today:
- Start Date/Time: 2000-01-01 00:00:00 (Use this baseline past date to capture all historic data)
- End Date/Time: ${today} 23:59:59

4. MANDATORY 24-HOUR TIMESTAMP EXPANSION:
Never pass a raw YYYY-MM-DD date alone to any tool parameter or query filter. Every date must be bounded to a precise second:
- Day Start: Always append 00:00:00
- Day End: Always append 23:59:59

5. DYNAMIC RANGE MAPPING REFERENCE (USING TODAY: ${today}):
- "today": Start: ${today} 00:00:00 | End: ${today} 23:59:59
- "last week": Start: ${lastWeekStartStr} 00:00:00 | End: ${lastWeekEndStr} 23:59:59

6. STRING FORMAT CONTROL:
- All temporal arguments provided to backend execution tools or query parameters must strictly follow the "YYYY-MM-DD HH:mm:ss" structural schema.
`;
}