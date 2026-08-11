export function getDateContext() {
const now = new Date();

// ============================================================
// DATE FORMATTERS
// ============================================================

const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const formatDateTime = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// ============================================================
// CURRENT DATE / TIME
// ============================================================

const today = formatDate(now);
const currentYear = now.getFullYear();
const currentDateTime = formatDateTime(now);

// ============================================================
// CURRENT BUSINESS DAY
//
// Business day:
// 18:30:00 -> next day 18:29:59
//
// This is used for TODAY and PAST ranges.
// ============================================================

const todayBusinessStart = new Date(now);
todayBusinessStart.setHours(18, 30, 0, 0);

let businessDayStart;

if (now >= todayBusinessStart) {
    businessDayStart = new Date(todayBusinessStart);
} else {
    businessDayStart = new Date(todayBusinessStart);
    businessDayStart.setDate(businessDayStart.getDate() - 1);
}

const businessDayEnd = new Date(businessDayStart);
businessDayEnd.setDate(businessDayEnd.getDate() + 1);
businessDayEnd.setSeconds(-1);

const todayFromDateTime = formatDateTime(businessDayStart);
const todayToDateTime = formatDateTime(businessDayEnd);

// ============================================================
// FUTURE DATE ANCHOR
//
// IMPORTANT:
// Future ranges MUST NOT use businessDayStart.
//
// Future ranges always start from TODAY'S CALENDAR DATE
// at 18:30:00.
//
// This prevents Next 7 Days from sometimes starting on
// yesterday when the current time is before 18:30.
// ============================================================

const futureDayStart = new Date(now);
futureDayStart.setHours(18, 30, 0, 0);

const futureDayStartDateTime = formatDateTime(futureDayStart);

// ============================================================
// LAST 2 DAYS
// ============================================================

const last2DaysStart = new Date(businessDayStart);
last2DaysStart.setDate(last2DaysStart.getDate() - 1);

const last2DaysFromDateTime = formatDateTime(last2DaysStart);
const last2DaysToDateTime = formatDateTime(businessDayEnd);

// ============================================================
// LAST 7 DAYS
//
// Exactly 7 business-day periods ending at the
// current business-day end.
// ============================================================

const last7DaysStart = new Date(businessDayStart);
last7DaysStart.setDate(last7DaysStart.getDate() - 7);

const last7DaysFromDateTime = formatDateTime(last7DaysStart);
const last7DaysToDateTime = formatDateTime(businessDayEnd);

// ============================================================
// LAST 30 DAYS
// ============================================================

const last30DaysStart = new Date(businessDayStart);
last30DaysStart.setDate(last30DaysStart.getDate() - 30);

const last30DaysFromDateTime = formatDateTime(last30DaysStart);
const last30DaysToDateTime = formatDateTime(businessDayEnd);

// ============================================================
// LAST WEEK
// ============================================================

const lastWeekStart = new Date(businessDayStart);
lastWeekStart.setDate(lastWeekStart.getDate() - 7);

const lastWeekEnd = new Date(businessDayEnd);

const lastWeekFromDateTime = formatDateTime(lastWeekStart);
const lastWeekToDateTime = formatDateTime(lastWeekEnd);

// ============================================================
// LAST MONTH
//
// Previous calendar month using business-day boundaries.
// ============================================================

const lastMonthStart = new Date(
    currentYear,
    now.getMonth() - 1,
    1,
    18,
    30,
    0,
    0
);

const lastMonthEnd = new Date(
    currentYear,
    now.getMonth(),
    1,
    18,
    29,
    59,
    999
);

const lastMonthFromDateTime = formatDateTime(lastMonthStart);
const lastMonthToDateTime = formatDateTime(lastMonthEnd);

// ============================================================
// LAST YEAR
//
// Previous calendar year using business-day boundaries.
// ============================================================

const lastYearStart = new Date(
    currentYear - 1,
    0,
    1,
    18,
    30,
    0,
    0
);

const lastYearEnd = new Date(
    currentYear,
    0,
    1,
    18,
    29,
    59,
    999
);

const lastYearFromDateTime = formatDateTime(lastYearStart);
const lastYearToDateTime = formatDateTime(lastYearEnd);

// ============================================================
// NEXT 2 DAYS
//
// Future ranges ALWAYS start from today's calendar date
// at 18:30:00.
// ============================================================

const next2DaysStart = new Date(futureDayStart);

const next2DaysEnd = new Date(futureDayStart);
next2DaysEnd.setDate(next2DaysEnd.getDate() + 2);
next2DaysEnd.setSeconds(-1);

const next2DaysFromDateTime = formatDateTime(next2DaysStart);
const next2DaysToDateTime = formatDateTime(next2DaysEnd);

// ============================================================
// NEXT 7 DAYS
//
// CRITICAL:
// MUST ALWAYS start from TODAY at 18:30:00.
//
// MUST NOT use businessDayStart.
// ============================================================

const next7DaysStart = new Date(futureDayStart);

const next7DaysEnd = new Date(futureDayStart);
next7DaysEnd.setDate(next7DaysEnd.getDate() + 7);
next7DaysEnd.setSeconds(-1);

const next7DaysFromDateTime = formatDateTime(next7DaysStart);
const next7DaysToDateTime = formatDateTime(next7DaysEnd);

// ============================================================
// NEXT 30 DAYS
// ============================================================

const next30DaysStart = new Date(futureDayStart);

const next30DaysEnd = new Date(futureDayStart);
next30DaysEnd.setDate(next30DaysEnd.getDate() + 30);
next30DaysEnd.setSeconds(-1);

const next30DaysFromDateTime = formatDateTime(next30DaysStart);
const next30DaysToDateTime = formatDateTime(next30DaysEnd);

// ============================================================
// NEXT WEEK
//
// Starts after the current Next 7 Days period.
// ============================================================

const nextWeekStart = new Date(futureDayStart);
nextWeekStart.setDate(nextWeekStart.getDate() + 7);

const nextWeekEnd = new Date(nextWeekStart);
nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
nextWeekEnd.setSeconds(-1);

const nextWeekFromDateTime = formatDateTime(nextWeekStart);
const nextWeekToDateTime = formatDateTime(nextWeekEnd);

// ============================================================
// NEXT MONTH
//
// Next calendar month using business-day boundaries.
// ============================================================

const nextMonthStart = new Date(
    currentYear,
    now.getMonth() + 1,
    1,
    18,
    30,
    0,
    0
);

const nextMonthEnd = new Date(
    currentYear,
    now.getMonth() + 2,
    1,
    18,
    29,
    59,
    999
);

const nextMonthFromDateTime = formatDateTime(nextMonthStart);
const nextMonthToDateTime = formatDateTime(nextMonthEnd);

// ============================================================
// NEXT YEAR
// ============================================================

const nextYearStart = new Date(
    currentYear + 1,
    0,
    1,
    18,
    30,
    0,
    0
);

const nextYearEnd = new Date(
    currentYear + 2,
    0,
    1,
    18,
    29,
    59,
    999
);

const nextYearFromDateTime = formatDateTime(nextYearStart);
const nextYearToDateTime = formatDateTime(nextYearEnd);

// ============================================================
// RETURN DATE CONTEXT
// ============================================================

return `

REAL TIME DATE CONTEXT

Today:
${today}

Current Year:
${currentYear}

Current DateTime:
${currentDateTime}

Timezone:
Asia/Kolkata

============================================================
BUSINESS DAY DEFINITION
=======================

The application business day is NOT:

00:00:00 -> 23:59:59

The application business day ALWAYS runs:

18:30:00 -> 18:29:59 of the following calendar day.

Current Business Day:

FromDateTime:
${todayFromDateTime}

ToDateTime:
${todayToDateTime}

============================================================
DATE CONTEXT IS THE SINGLE SOURCE OF TRUTH
==========================================

The generated date values in this DATE CONTEXT are the
SINGLE SOURCE OF TRUTH.

The AI MUST use these generated values exactly.

The AI MUST NOT independently calculate dates.

The AI MUST NOT modify, shift, round, convert, or reinterpret
the generated FromDateTime or ToDateTime.

The AI MUST NOT convert these values to UTC.

The AI MUST NOT change business-day boundaries to midnight.

The AI MUST NOT independently add or subtract days.

============================================================
DATE FORMAT
===========

Every backend date/time parameter MUST use:

YYYY-MM-DD HH:mm:ss

Never send a raw YYYY-MM-DD date.

Never send a date without time.

Never send ISO format containing T.

All backend temporal parameters MUST contain both date
and time.

============================================================
TIME EXPRESSION PRIORITY
========================

Resolve time expressions using this priority:

1. Explicit user-specified date or time range
2. TODAY
3. LAST relative range
4. NEXT relative range
5. UPCOMING / FUTURE
6. HISTORICAL / PAST

An explicit user-specified range ALWAYS overrides the
default interpretation of latest, recent, current,
synopsis, summary, or overview.

============================================================
LATEST / RECENT / CURRENT / SYNOPSIS
====================================

When no explicit time range is provided, these expressions
MUST be interpreted as TODAY:

latest
recent
recently
newest
most recent
current
current details
current status
latest created
recently created
latest leads
recent leads
latest records
recent records
latest follow-ups
recent follow-ups
latest activity
recent activity
latest updates
recent updates
latest details
recent details
latest status
recent status
synopsis
latest synopsis
recent synopsis
summary
latest summary
recent summary
overview
latest overview
recent overview

Use:

FromDateTime:
${todayFromDateTime}

ToDateTime:
${todayToDateTime}

============================================================
LATEST CREATED DATA
===================

When latest, recent, newest, or most recent created
records are requested without an explicit range:

Use the CURRENT BUSINESS DAY.

FromDateTime:
${todayFromDateTime}

ToDateTime:
${todayToDateTime}

If ordering is applicable, use the relevant Created
Date/Time field in descending order.

============================================================
SYNOPSIS / SUMMARY / OVERVIEW
=============================

When synopsis, summary, overview, current status,
or current details are requested without an explicit
time range:

Use the CURRENT BUSINESS DAY.

FromDateTime:
${todayFromDateTime}

ToDateTime:
${todayToDateTime}

Do NOT interpret these requests as historical or
all-time requests.

============================================================
EXPLICIT RANGE OVERRIDE
=======================

If latest, recent, recently, newest, most recent,
current, synopsis, summary, overview, or similar
expressions are combined with an explicit time range:

The explicit range MUST be used.

The default TODAY interpretation MUST NOT override
the explicit range.

============================================================
TODAY
=====

When the user explicitly requests today or an equivalent
current-day expression:

Use:

FromDateTime:
${todayFromDateTime}

ToDateTime:
${todayToDateTime}

Today means the CURRENT BUSINESS DAY.

Do NOT use:

00:00:00 -> 23:59:59

unless the user explicitly requests a calendar day.

============================================================
LAST 2 DAYS
===========

"Last 2 Days" means exactly 2 business-day periods
ending at the current business-day end.

FromDateTime:
${last2DaysFromDateTime}

ToDateTime:
${last2DaysToDateTime}

============================================================
LAST 7 DAYS
===========

"Last 7 Days" means exactly 7 business-day periods
ending at the current business-day end.

FromDateTime:
${last7DaysFromDateTime}

ToDateTime:
${last7DaysToDateTime}

The range MUST be calculated from:

businessDayStart - 7 days

through:

businessDayEnd

The AI MUST use the generated values.

============================================================
LAST 30 DAYS
============

"Last 30 Days" means exactly 30 business-day periods
ending at the current business-day end.

FromDateTime:
${last30DaysFromDateTime}

ToDateTime:
${last30DaysToDateTime}

============================================================
LAST WEEK
=========

"Last Week" uses the previous 7-business-day period.

FromDateTime:
${lastWeekFromDateTime}

ToDateTime:
${lastWeekToDateTime}

============================================================
LAST MONTH
==========

"Last Month" means the previous calendar month using
business-day boundaries.

FromDateTime:
${lastMonthFromDateTime}

ToDateTime:
${lastMonthToDateTime}

============================================================
LAST YEAR
=========

"Last Year" means the previous calendar year using
business-day boundaries.

FromDateTime:
${lastYearFromDateTime}

ToDateTime:
${lastYearToDateTime}

============================================================
FUTURE RANGE ANCHOR
===================

CRITICAL RULE:

ALL future relative ranges MUST start from:

TODAY at 18:30:00

The future range start MUST use:

${futureDayStartDateTime}

The future range start MUST NOT use:

businessDayStart

This rule prevents future ranges from moving to the
previous calendar date when the current time is before
18:30.

============================================================
NEXT 2 DAYS
===========

"Next 2 Days" means exactly 2 future business-day periods.

FromDateTime:
${next2DaysFromDateTime}

ToDateTime:
${next2DaysToDateTime}

The start MUST be today's calendar date at 18:30:00.

============================================================
NEXT 7 DAYS
===========

"Next 7 Days" means exactly 7 future business-day periods.

FromDateTime:
${next7DaysFromDateTime}

ToDateTime:
${next7DaysToDateTime}

The FromDateTime MUST ALWAYS be today's calendar date
at 18:30:00.

The FromDateTime MUST NEVER be based on businessDayStart.

The FromDateTime MUST NEVER move to yesterday.

The FromDateTime MUST NEVER depend on whether the current
time is before or after 18:30.

The AI MUST use the generated next7DaysFromDateTime exactly.

============================================================
NEXT 30 DAYS
============

"Next 30 Days" means exactly 30 future business-day periods.

FromDateTime:
${next30DaysFromDateTime}

ToDateTime:
${next30DaysToDateTime}

The start MUST be today's calendar date at 18:30:00.

============================================================
NEXT WEEK
=========

"Next Week" means the 7-business-day period immediately
following the current Next 7 Days period.

FromDateTime:
${nextWeekFromDateTime}

ToDateTime:
${nextWeekToDateTime}

============================================================
NEXT MONTH
==========

"Next Month" means the next calendar month using
business-day boundaries.

FromDateTime:
${nextMonthFromDateTime}

ToDateTime:
${nextMonthToDateTime}

============================================================
NEXT YEAR
=========

"Next Year" means the next calendar year using
business-day boundaries.

FromDateTime:
${nextYearFromDateTime}

ToDateTime:
${nextYearToDateTime}

============================================================
UPCOMING / FUTURE
=================

When the user requests upcoming, future, scheduled,
planned, or similar future data without specifying
a duration:

FromDateTime:
${futureDayStartDateTime}

ToDateTime:
2099-12-31 23:59:59

The start MUST be today's calendar date at 18:30:00.

Do NOT use businessDayStart.

============================================================
HISTORICAL / PAST
=================

Use the historical range ONLY when the user explicitly
requests historical, history, past, old, all-history,
complete history, or all-time data.

FromDateTime:

2000-01-01 18:30:00

ToDateTime:

${todayToDateTime}

The historical range MUST NOT be used for:

latest
recent
recently
newest
most recent
current
synopsis
summary
overview
latest created
recent created

============================================================
CALENDAR DAY EXCEPTION
======================

Use calendar-day boundaries ONLY when the user explicitly
requests calendar-day boundaries.

Otherwise ALWAYS use the application's business-day
boundary:

18:30:00 -> 18:29:59 next day.

============================================================
BACKEND EXECUTION RULE
======================

Before calling a backend tool:

1. Identify the user's time expression.
2. Check whether an explicit range was provided.
3. If an explicit range exists, use that range.
4. If latest/recent/current/synopsis/summary/overview
   is used without an explicit range, use TODAY.
5. For TODAY, use the generated current business-day values.
6. For PAST ranges, use the generated past-range values.
7. For FUTURE ranges, use the generated future-range values.
8. Pass the generated FromDateTime and ToDateTime exactly.
9. Never independently calculate another date.

============================================================
MANDATORY FROMDATE / TODATE RULE
================================

When a backend tool requires FromDateTime and ToDateTime:

ALWAYS provide both.

Never provide:

null

empty string

undefined

YYYY-MM-DD only

an independently calculated date.

The values MUST come from the generated DATE CONTEXT.

============================================================
FINAL STRICT RULES
==================

1. Generated date values are the SINGLE SOURCE OF TRUTH.

2. Business day is:
   18:30:00 -> 18:29:59 next day.

3. Latest defaults to TODAY.

4. Recent defaults to TODAY.

5. Recently defaults to TODAY.

6. Newest defaults to TODAY.

7. Most recent defaults to TODAY.

8. Current defaults to TODAY.

9. Synopsis defaults to TODAY.

10. Summary defaults to TODAY.

11. Overview defaults to TODAY.

12. Latest Created defaults to TODAY.

13. Explicit ranges ALWAYS override these defaults.

14. Historical data is ONLY selected when explicitly requested.

15. Never use 2000-01-01 for latest, recent, current,
    synopsis, summary, or overview.

16. Never use 2001-01-01 as a default date.

17. Never leave mandatory FromDateTime or ToDateTime empty.

18. All backend dates MUST use:
    YYYY-MM-DD HH:mm:ss

19. Past ranges use the CURRENT BUSINESS DAY as their
    ending anchor.

20. Future ranges use TODAY'S CALENDAR DATE at 18:30:00
    as their starting anchor.

21. Next 7 Days MUST ALWAYS start from TODAY at 18:30:00.

22. Next 7 Days MUST NEVER use businessDayStart.

23. Next 7 Days MUST NEVER move to yesterday.

24. The AI MUST NOT independently calculate or modify
    generated date values.

25. The generated DATE CONTEXT MUST be followed exactly.
    `;
    }
