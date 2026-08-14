let userTimeZone = "Asia/Kolkata";

export function setTimeZone(timeZone) {
    userTimeZone = timeZone || "Asia/Kolkata";
}

export function getDateContext() {
    const timeZone = "Asia/Kolkata";
    const now = new Date();

    // ============================================================
    // CURRENT LOCAL DATE/TIME
    // ============================================================

    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    });

    const parts = formatter.formatToParts(now);

    const getPart = (type) =>
        parts.find(p => p.type === type)?.value || "00";

    const year = Number(getPart("year"));
    const month = Number(getPart("month"));
    const day = Number(getPart("day"));

    const currentTime =
        `${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;

    const today =
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;


    // ============================================================
    // LOCAL CALENDAR DATE
    // ============================================================

    const localDate = new Date(
        year,
        month - 1,
        day
    );


    // ============================================================
    // DATE HELPERS
    // ============================================================

    const addDays = (date, days) => {

        const result = new Date(date);

        result.setDate(
            result.getDate() + days
        );

        return result;
    };


    const addMonths = (date, months) => {

        const result = new Date(date);

        result.setMonth(
            result.getMonth() + months
        );

        return result;
    };


    const addYears = (date, years) => {

        const result = new Date(date);

        result.setFullYear(
            result.getFullYear() + years
        );

        return result;
    };


    const formatDate = (date) => {

        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")
        ].join("-");
    };


    const formatStart = (date) => {
        const adjustedDate = addDays(date, -1);
        return `${formatDate(adjustedDate)} 18:30:00`;
    };


    const formatEnd = (date) => {
        const adjustedDate = addDays(date, -1);
        return `${formatDate(adjustedDate)} 23:59:59`;
    };


    // ============================================================
    // DYNAMIC N-DAY CALCULATION
    // ============================================================

    const getLastNDays = (n) => {

        n = Number(n);

        if (
            !Number.isInteger(n) ||
            n <= 0
        ) {
            return null;
        }

        const startDate =
            addDays(
                localDate,
                -(n - 1)
            );

        return {
            n: n,
            from: formatDate(addDays(startDate, -1)),
            to: today,
            fromDateTime: formatStart(startDate),
            toDateTime: `${today} 23:59:59`
        };
    };


    const getNextNDays = (n) => {

        n = Number(n);

        if (
            !Number.isInteger(n) ||
            n <= 0
        ) {
            return null;
        }

        const endDate =
            addDays(
                localDate,
                n - 1
            );

        return {
            n: n,
            from: formatDate(addDays(localDate, -1)),
            to: formatDate(endDate),
            fromDateTime: formatStart(localDate),
            toDateTime: formatEnd(addDays(endDate, 1))
        };
    };


    // ============================================================
    // DYNAMIC N-WEEK CALCULATION
    // ============================================================

    const getLastNWeeks = (n) => {

        n = Number(n);

        if (
            !Number.isInteger(n) ||
            n <= 0
        ) {
            return null;
        }

        return getLastNDays(n * 7);
    };


    const getNextNWeeks = (n) => {

        n = Number(n);

        if (
            !Number.isInteger(n) ||
            n <= 0
        ) {
            return null;
        }

        return getNextNDays(n * 7);
    };


    // ============================================================
    // DYNAMIC N-MONTH CALCULATION
    // ============================================================

    const getLastNMonths = (n) => {

        n = Number(n);

        if (
            !Number.isInteger(n) ||
            n <= 0
        ) {
            return null;
        }

        const startDate =
            addMonths(
                localDate,
                -n
            );

        const fromDate =
            addDays(
                startDate,
                1
            );

        return {
            n: n,
            from: formatDate(addDays(fromDate, -1)),
            to: today,
            fromDateTime: formatStart(fromDate),
            toDateTime: `${today} 23:59:59`
        };
    };


    const getNextNMonths = (n) => {

        n = Number(n);

        if (
            !Number.isInteger(n) ||
            n <= 0
        ) {
            return null;
        }

        const endDate =
            addMonths(
                localDate,
                n
            );

        const finalDate =
            addDays(
                endDate,
                -1
            );

        return {
            n: n,
            from: formatDate(addDays(localDate, -1)),
            to: formatDate(finalDate),
            fromDateTime: formatStart(localDate),
            toDateTime: formatEnd(endDate)
        };
    };


    // ============================================================
    // DYNAMIC N-YEAR CALCULATION
    // ============================================================

    const getLastNYears = (n) => {

        n = Number(n);

        if (
            !Number.isInteger(n) ||
            n <= 0
        ) {
            return null;
        }

        const startDate =
            addYears(
                localDate,
                -n
            );

        const fromDate =
            addDays(
                startDate,
                1
            );

        return {
            n: n,
            from: formatDate(addDays(fromDate, -1)),
            to: today,
            fromDateTime: formatStart(fromDate),
            toDateTime: `${today} 23:59:59`
        };
    };


    const getNextNYears = (n) => {

        n = Number(n);

        if (
            !Number.isInteger(n) ||
            n <= 0
        ) {
            return null;
        }

        const endDate =
            addYears(
                localDate,
                n
            );

        const finalDate =
            addDays(
                endDate,
                -1
            );

        return {
            n: n,
            from: formatDate(addDays(localDate, -1)),
            to: formatDate(finalDate),
            fromDateTime: formatStart(localDate),
            toDateTime: formatEnd(endDate)
        };
    };


    // ============================================================
    // BASIC DATES
    // ============================================================

    const yesterday =
        addDays(localDate, -1);

    const tomorrow =
        addDays(localDate, 1);


    // ============================================================
    // DEFAULT N / 7 DAYS
    // ============================================================

    const defaultLast7 =
        getLastNDays(7);

    const defaultNext7 =
        getNextNDays(7);

    const defaultNextN = (n) => getNextNDays(n);


    // ============================================================
    // WEEK CALCULATIONS
    // ============================================================

    const dayOfWeek =
        localDate.getDay();

    const mondayOffset =
        dayOfWeek === 0
            ? -6
            : 1 - dayOfWeek;


    const thisWeekMonday =
        addDays(
            localDate,
            mondayOffset
        );


    const thisWeekSunday =
        addDays(
            thisWeekMonday,
            6
        );


    const lastWeekMonday =
        addDays(
            thisWeekMonday,
            -7
        );


    const lastWeekSunday =
        addDays(
            thisWeekMonday,
            -1
        );


    const nextWeekMonday =
        addDays(
            thisWeekMonday,
            7
        );


    const nextWeekSunday =
        addDays(
            nextWeekMonday,
            6
        );


    // ============================================================
    // RETURN PROMPT CONTEXT
    // ============================================================

    return `

REAL TIME DATE/TIME CONTEXT
===========================

TIMEZONE:
${timeZone}

CURRENT LOCAL DATE:
${today}

CURRENT LOCAL TIME:
${currentTime}

CURRENT YEAR:
${year}


============================================================
AUTHORITATIVE DATE SOURCE
============================================================

All relative date calculations MUST use:

TIMEZONE:
${timeZone}

CURRENT LOCAL DATE:
${today}

CURRENT LOCAL TIME:
${currentTime}

These values are the ONLY authoritative date/time reference.

NEVER use:

- UTC date
- server date
- IIS date
- SQL Server date
- database date
- LLM/system date
- conversation timestamp
- browser/server timezone


============================================================
BACKEND DATE/TIME FORMAT & MINUS 1 DAY REQUIREMENT
============================================================

All backend date/time parameters MUST use:

YYYY-MM-DD HH:mm:ss

🚨 ABSOLUTE MANDATORY RULE FOR FROM DATE:
EVERY calculated or resolved FROM date/timestamp MUST BE MINUS 1 DAY (-1 DAY) compared to its calendar boundary. 
If the target calendar FROM date is TODAY (e.g. ${today}), the backend 'fromdate' parameter MUST be shifted back by 1 calendar day (e.g. ${formatDate(addDays(localDate, -1))} 18:30:00). 
Never pass the exact current local date or start date as an unadjusted FROM datetime if the rule specifies shifting back.

DAY START (FROM):
18:30:00 (ALWAYS preceded by the date minus 1 calendar day without exception).

DAY END (TO):
23:59:59 (For future/next requests, shifted back by -1 day relative to the target TO calendar date so that both boundaries have the required -1 day shift behavior).


============================================================
DYNAMIC TEMPORAL DURATION
============================================================

Temporal durations MUST be resolved dynamically from the
USER'S ACTUAL REQUEST.

The system MUST detect a numeric value associated with a
temporal unit.

Supported temporal units include:

day
days
week
weeks
month
months
year
years

The numeric value MUST be treated as dynamic.

There is NO predefined list of valid numbers.

Do NOT hardcode possible values.

Do NOT enumerate possible values.

Do NOT restrict the duration to commonly used values.

Do NOT require a specific number.

ANY positive integer supplied by the user is valid.


============================================================
DYNAMIC N EXTRACTION
============================================================

When the user's request contains:

<number> + temporal unit

extract the numeric value as N.

The surrounding natural-language wording does NOT need to
match a predefined sentence.

The system must identify the temporal meaning from the
user's natural language.


============================================================
PAST / RECENT DYNAMIC RANGE
============================================================

If the user's temporal intent means:

past
previous
recent
latest
historical
before
last

AND a numeric duration is supplied:

Use the extracted N.

For DAY duration:

FROM DATE =
(TODAY - (N - 1) calendar days) minus 1 additional calendar day (so that backend fromdate is ALWAYS shifted back by -1 day).

TO DATE =
TODAY

TODAY is included.


============================================================
FUTURE / UPCOMING DYNAMIC RANGE
============================================================

If the user's temporal intent means:

next
upcoming
future
coming
scheduled

AND a numeric duration is supplied:

Use the extracted N.

For DAY duration:

FROM DATE =
TODAY minus 1 calendar day (e.g., if TODAY is ${today}, FROM date must be ${formatDate(addDays(localDate, -1))} 18:30:00).

TO DATE =
TODAY + (N - 1) calendar days (with the mandatory -1 day backend offset adjustment applied).

TODAY is included, but BOTH the FROM and TO backend timestamps receive a -1 day offset adjustment.


============================================================
WEEK DURATION
============================================================

If the user provides a numeric week duration:

Convert the dynamic N weeks into the corresponding
calendar-week duration.

For past:

FROM =
(TODAY minus N calendar weeks) minus 1 additional calendar day (mandatory -1 day offset applied).

TO =
TODAY

For future:

FROM =
TODAY minus 1 calendar day (mandatory -1 day offset applied).

TO =
TODAY plus N calendar weeks (with -1 day offset applied to the TO timestamp).


============================================================
MONTH DURATION
============================================================

If the user provides a numeric month duration:

Use calendar-month arithmetic.

For past:

FROM =
(TODAY minus N calendar months) minus 1 additional calendar day (mandatory -1 day offset applied).

TO =
TODAY

For future:

FROM =
TODAY minus 1 calendar day (mandatory -1 day offset applied).

TO =
TODAY plus N calendar months (with -1 day offset applied to the TO timestamp).


============================================================
YEAR DURATION
============================================================

If the user provides a numeric year duration:

Use calendar-year arithmetic.

For past:

FROM =
(TODAY minus N calendar years) minus 1 additional calendar day (mandatory -1 day offset applied).

TO =
TODAY

For future:

FROM =
TODAY minus 1 calendar day (mandatory -1 day offset applied).

TO =
TODAY plus N calendar years (with -1 day offset applied to the TO timestamp).


============================================================
IMPORTANT — DO NOT REQUIRE FIXED PHRASES
============================================================

Do NOT require the user to say exactly:

"last N days"

The temporal duration may appear anywhere in the user's
natural-language request.

Identify:

1. Numeric value
2. Temporal unit
3. Temporal direction/meaning

Then calculate the date range.

For example, the user may naturally express a duration
using words such as:

last
past
previous
recent
latest
over
within
for
during
next
upcoming
coming
future

These are semantic indicators, not a fixed phrase list.

The actual number MUST always be extracted dynamically.


============================================================
VAGUE LATEST / RECENT REQUEST
============================================================

The following indicate a recent/latest intent:

latest
recent
recently
newest
most recent
lately
latest details
recent details
latest records
recent records
latest data
recent data
latest synopsis
recent synopsis
latest summary
recent summary
latest activity
recent activity
recently created
recently added

If a numeric duration is present:

USE THE NUMERIC DURATION.

If NO numeric duration and NO explicit date is present:

USE DEFAULT LAST 7 CALENDAR DAYS.


============================================================
VAGUE UPCOMING REQUEST
============================================================

The following indicate future/upcoming intent:

upcoming
future
coming
coming up
next
scheduled
upcoming records
future records
upcoming details
upcoming synopsis
future synopsis
upcoming summary
future summary

If a numeric duration is present:

USE THE NUMERIC DURATION.

If NO numeric duration and NO explicit date is present:

USE DEFAULT NEXT 7 CALENDAR DAYS.


============================================================
DEFAULT LAST 7 DAYS
============================================================

The default 7-day range MUST ONLY be used when:

1. The request has a recent/latest/past meaning
2. AND no numeric duration is supplied
3. AND no explicit date is supplied

Default:

FROM:
${defaultLast7.fromDateTime}

TO:
${defaultLast7.toDateTime}


============================================================
DEFAULT NEXT 7 DAYS / DEFAULT NEXT N
============================================================

The default next range MUST ONLY be used when:

1. The request has an upcoming/future meaning
2. AND no numeric duration is supplied
3. AND no explicit date is supplied

Default (7 days):

FROM:
${defaultNext7.fromDateTime}

TO:
${defaultNext7.toDateTime}

For a custom dynamic default N:
Use defaultNextN(n) to evaluate dynamically.


============================================================
TODAY
============================================================

FROM:
${formatStart(localDate)}

TO:
${today} 23:59:59


============================================================
YESTERDAY
============================================================

FROM:
${formatStart(yesterday)}

TO:
${formatDate(yesterday)} 23:59:59


============================================================
TOMORROW
============================================================

FROM:
${formatStart(tomorrow)}

TO:
${formatDate(tomorrow)} 23:59:59


============================================================
LAST WEEK
============================================================

"last week" means the previous calendar week.

Week starts Monday.

FROM:
${formatStart(lastWeekMonday)}

TO:
${formatDate(lastWeekSunday)} 23:59:59


============================================================
THIS WEEK
============================================================

"this week" means the current calendar week.

FROM:
${formatStart(thisWeekMonday)}

TO:
${formatDate(thisWeekSunday)} 23:59:59


============================================================
NEXT WEEK
============================================================

"next week" means the next calendar week.

FROM:
${formatStart(nextWeekMonday)}

TO:
${formatEnd(addDays(nextWeekSunday, 1))}


============================================================
GENERIC LEAD DETAILS
============================================================

If the user asks:

show leads
show lead details
show lead information
list leads
show me the lead details
show latest lead details
show recent lead details

and no date, numeric duration, or explicit historical
range is supplied:

USE DEFAULT LAST 7 CALENDAR DAYS.

Do NOT perform an unlimited all-time search.


============================================================
GENERIC SYNOPSIS / SUMMARY
============================================================

If the user asks for:

synopsis
summary
overview
report
activity
data
details

and no date or duration is supplied:

USE DEFAULT LAST 7 CALENDAR DAYS for historical/recent
information.

If the semantic meaning is future/upcoming:

USE DEFAULT NEXT 7 CALENDAR DAYS.


============================================================
EXPLICIT DATE RANGE
============================================================

If the user explicitly provides FROM and TO dates:

USE THE USER'S EXACT DATES.

Do NOT apply the default 7-day rule.

Do NOT replace the user's dates.

Do NOT calculate a different range.

Convert them only to the required backend time format, applying the mandatory -1 day offset specifically to the FROM date:

FROM:
YYYY-MM-DD 18:30:00 (with mandatory -1 day shift applied)

TO:
YYYY-MM-DD 23:59:59


============================================================
DATE RESOLUTION PRIORITY
============================================================

Resolve temporal information using this priority:

1. Explicit FROM/TO date range
2. Explicit date
3. Explicit numeric temporal duration
4. Explicit relative period
5. Vague latest/recent/upcoming meaning
6. Default 7-day range


============================================================
N AND MAXCOUNT ARE DIFFERENT
============================================================

A numeric value used for record count MUST NOT be confused
with a numeric temporal duration.

If the user asks for a number of LEADS:

that number is MaxCount.

If the user asks for a number of DAYS/WEEKS/MONTHS/YEARS:

that number is a temporal duration.

If both are present, preserve both independently.


============================================================
GETLEADSDETAILS
============================================================

Whenever a temporal range is resolved:

The EXACT calculated values MUST be passed to:

GetLeadsDetails

using:

filterlead.fromdate
filterlead.todate

Format:

YYYY-MM-DD HH:mm:ss


============================================================
MANDATORY RESPONSE DATE RANGE
============================================================

Whenever a date/time filter is applied, the final response
MUST display the resolved date range.

Use:

Time horizon:
<resolved temporal meaning>

Date range:
<exact fromdate> to <exact todate>

The displayed range MUST be exactly the same range that was
sent to GetLeadsDetails.

Never omit the date range for:

latest
recent
newest
upcoming
future
next
past
previous
synopsis
summary
activity
details
reports
or any other request where a temporal filter was applied.


============================================================
LATEST SORTING
============================================================

For:

latest
recent
newest
most recent

results MUST be sorted newest first using the appropriate
backend sorting mechanism.

Do NOT place ORDER BY inside the SQL query.

Keep filtering and sorting separate.


============================================================
FILTER PRESERVATION
============================================================

Always preserve all existing user filters.

Example:

If the user asks for recent leads assigned to a specific
person, preserve the assignment filter AND apply the
resolved temporal range.

Do not remove existing filters when applying date logic.


============================================================
ALL-TIME REQUEST
============================================================

Only perform an all-time/unbounded search when the user
explicitly requests something such as:

all leads
all records
entire history
complete history
all-time
from the beginning

A vague request such as:

latest leads
recent leads
latest synopsis
recent activity

MUST NOT be treated as all-time.


============================================================
FINAL TEMPORAL VALIDATION
============================================================

Before calling the backend, verify:

1. Did the user provide an explicit date?

If YES:
    use the explicit date.

2. Did the user provide a numeric temporal duration?

If YES:
    dynamically extract the numeric value.

3. Is the duration numeric value being used as N?

If YES:
    calculate the range using N.

4. Is N being replaced by a default?

If YES:
    STOP and use the extracted N.

5. Is there no numeric duration and the request is vague
    latest/recent/upcoming?

If YES:
    use the appropriate default 7-day range.

6. Was the exact range passed to GetLeadsDetails?

7. Is the exact same range displayed in the response?

If any answer is NO, correct the temporal resolution before
executing the request.


============================================================
ABSOLUTE RULE
============================================================

The system MUST dynamically understand temporal durations.

Do NOT hardcode numeric duration values.

Do NOT whitelist numeric durations.

Do NOT enumerate numeric examples.

Do NOT require specific duration phrases.

Extract the numeric value from the user's natural language.

Any valid positive integer associated with a temporal unit
must be treated as a dynamic duration.

The default 7-day range is ONLY a fallback when no explicit
duration or date is provided.

END OF DATE/TIME CONTEXT.
`;
}