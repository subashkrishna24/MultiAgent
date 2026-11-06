// Date & Time gate: given the step args and the moment a contact ENTERS the node,
// compute when that contact is released to the next step.
//
//   { dueAt, expireAt }  -> contact is stored with DueAt / ExpireAt (UTC); the next
//                           step only picks it up when DueAt <= now <= ExpireAt
//   { closed: reason }   -> the window is over, nobody passes this node any more
//   { error: reason }    -> node not configured / invalid value
//
// datecondition (see R14 in prompts/workflow.prompt.js):
//   0  WAIT          datevalue "2 Hours" | "30 Minutes" | "1 Days"
//   4  BETWEEN DATES datevalue "YYYY-MM-DD HH:mm:ss~YYYY-MM-DD HH:mm:ss"  (UTC, or local with
//                    SCHEDULER_DATERANGE_LOCAL=true; a value with Z / +05:30 is always exact)
//   8  TIME SLOT     datevalue "HH:mm~HH:mm" (account local time) + daysofweek
//   9  PREFERRED DAY daysofweek "monday" | "anyday" | "monday,friday"   (account local time)
//   ignoreweekend    never release on Saturday / Sunday (local)
import { parseDelayMs } from "./workflowSteps.js";

const DAY = 86_400_000;
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SEARCH_DAYS = 15; // look this far ahead for the next allowed day / slot

/* ---------------- time zone helpers (no library needed) ---------------- */

const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz))
    fmtCache.set(
      tz,
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "long",
      }),
    );
  return fmtCache.get(tz);
}

// wall-clock parts of a UTC instant in a time zone
export function partsIn(tz, ms) {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return {
    y: +p.year,
    m: +p.month,
    d: +p.day,
    hh: +p.hour,
    mm: +p.minute,
    ss: +p.second,
    dow: DAYS.indexOf(p.weekday.toLowerCase()),
  };
}

function offsetAt(tz, ms) {
  const p = partsIn(tz, ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(ms / 1000) * 1000;
}

// local wall time -> UTC instant (day may overflow: d+1 at month end is fine)
export function zonedToUtc(tz, y, m, d, hh = 0, mm = 0) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetAt(tz, guess);
  return guess - offsetAt(tz, first); // second pass fixes DST edges
}

// 00:00 local of (the local day of `ms`) + addDays, as UTC ms
function localDayStart(tz, ms, addDays = 0) {
  const p = partsIn(tz, ms);
  return zonedToUtc(tz, p.y, p.m, p.d + addDays, 0, 0);
}

const isWeekend = (dow) => dow === 0 || dow === 6;

/* ---------------- value parsers ---------------- */

const ABBR = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

// "anyday" | "" -> all days ; "monday,friday" -> {1,5} ; null when invalid
export function parseDays(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s || s === "anyday" || s === "any day" || s === "any" || s === "all")
    return new Set([0, 1, 2, 3, 4, 5, 6]);
  const out = new Set();
  for (const tok of s.split(/[\s,;|]+/).filter(Boolean)) {
    let i = DAYS.indexOf(tok);
    if (i < 0) i = ABBR[tok] ?? -1;
    if (i < 0) return null;
    out.add(i);
  }
  return out.size ? out : null;
}

function parseHm(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = +m[1], mm = +m[2];
  return hh < 24 && mm < 60 ? { hh, mm } : null;
}

// A date-range time ("Proceed from the step", datecondition 4) -> UTC ms.
//   "…Z" / "…+05:30" carry their own zone and are used as they are.
//   Otherwise the value is wall-clock time: UTC by default, the account time zone when
//   SCHEDULER_DATERANGE_LOCAL=true (if the Preview popup saves the times as typed).
function parseRangeTime(s, tz, local) {
  const v = String(s ?? "").trim().replace(" ", "T");
  if (!v) return null;
  if (/(Z|[+-]\d\d(:?\d\d)?)$/i.test(v) && /T\d/.test(v)) {
    const t = Date.parse(v.replace(/([+-]\d\d)$/, "$1:00"));
    return Number.isNaN(t) ? null : t;
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh = "0", mm = "0"] = m;
  return local ? zonedToUtc(tz, +y, +mo, +d, +hh, +mm) : Date.UTC(+y, +mo - 1, +d, +hh, +mm);
}

const truthy = (v) => v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";

/* ---------------- the gate ---------------- */

export function isGateConfigured(args) {
  return !(args.datecondition === undefined || args.datecondition === null || args.datecondition === "");
}

/**
 * @param opts.rangeLocal  datecondition 4 times without a zone are local (account tz), not UTC
 */
export function computeGate(args, nowMs, tz, opts = {}) {
  if (!isGateConfigured(args))
    return { error: "date and time is not set - open Preview workflow and set it" };

  const ignoreWeekend = truthy(args.ignoreweekend);
  const skipWeekend = (ms) => {
    let guard = 0;
    while (ignoreWeekend && isWeekend(partsIn(tz, ms).dow) && guard++ < 3) ms += DAY;
    return ms;
  };

  // walk the next days, return the first allowed day's [start, end) window
  const nextWindow = (days, startHm, endHm) => {
    for (let i = 0; i < SEARCH_DAYS; i++) {
      const dayStart = localDayStart(tz, nowMs, i);
      const p = partsIn(tz, dayStart + 12 * 3_600_000); // noon: safe from DST edges
      if (!days.has(p.dow) || (ignoreWeekend && isWeekend(p.dow))) continue;
      const s = startHm ? zonedToUtc(tz, p.y, p.m, p.d, startHm.hh, startHm.mm) : dayStart;
      const e = endHm ? zonedToUtc(tz, p.y, p.m, p.d, endHm.hh, endHm.mm) : localDayStart(tz, nowMs, i + 1);
      if (nowMs >= e) continue; // today's window already over
      return { dueAt: Math.max(nowMs, s), expireAt: e };
    }
    return null;
  };

  switch (Number(args.datecondition)) {
    case 0: {
      const delay = parseDelayMs(args.datevalue);
      if (!delay) return { error: `invalid wait value "${args.datevalue}" (expected like "2 Hours")` };
      return { dueAt: skipWeekend(nowMs + delay), expireAt: null };
    }

    case 4: {
      const [a, b] = String(args.datevalue ?? "").split("~");
      const start = parseRangeTime(a, tz, opts.rangeLocal), end = parseRangeTime(b, tz, opts.rangeLocal);
      if (!start || !end || end <= start)
        return { error: `invalid date range "${args.datevalue}" (expected "start~end")` };
      if (nowMs > end) return { closed: "the date range is over" };
      const due = skipWeekend(Math.max(nowMs, start));
      if (due > end) return { closed: "no weekday left inside the date range" };
      return { dueAt: due, expireAt: end };
    }

    case 8: {
      const [a, b] = String(args.datevalue ?? "").split("~");
      const s = parseHm(a), e = parseHm(b);
      if (!s || !e || e.hh * 60 + e.mm <= s.hh * 60 + s.mm)
        return { error: `invalid time slot "${args.datevalue}" (expected "HH:mm~HH:mm")` };
      const days = parseDays(args.daysofweek);
      if (!days) return { error: `invalid daysofweek "${args.daysofweek}"` };
      return nextWindow(days, s, e) ?? { error: "no allowed day found for the time slot" };
    }

    case 9: {
      const days = parseDays(args.daysofweek);
      if (!days) return { error: `invalid daysofweek "${args.daysofweek}"` };
      return nextWindow(days, null, null) ?? { error: "no allowed preferred day found" };
    }

    default:
      return { error: `datecondition ${args.datecondition} is not supported` };
  }
}
