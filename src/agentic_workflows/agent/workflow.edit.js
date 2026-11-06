// workflow.edit.js
// The LLM only CLASSIFIES the user's sentence (small JSON). This file edits the workflow JSON,
// asks "which mail?", asks for missing templates, checks the configuration, and builds the reply.
//
// SESSION FIELDS (set by the controller):
//   session.wfMode = "create" | "edit" | "reuse"   (default "create")
//   session.wfPid  = id of the workflow opened with "Edit" (only used in edit mode)
//
// SAVE AS DRAFT:
//   - incomplete workflow  -> saved as a draft, status = false
//   - user says "save as draft" (even when complete) -> saved as a draft, status = false
//   - complete workflow and user says "yes"/"save"/"update" -> status = true

const EVENTS = {
  mail: [
    ["Deliver", "delivered"],
    ["Open", "opened"],
    ["Not Open", "notopened"],
    ["Click", "clicked"],
    ["Not Click", "notclicked"],
    ["Bounce", "bounced"],
  ],
  sms: [
    ["Send", "sent"],
    ["Deliver", "delivered"],
    ["Click", "clicked"],
    ["Not Click", "notclicked"],
    ["Bounce", "bounced"],
  ],
  whatsapp: [
    ["Deliver", "delivered"],
    ["Read", "read"],
    ["Not Read", "notread"],
    ["Clicked", "clicked"],
    ["Not Clicked", "notclicked"],
    ["Failed", "failed"],
  ],
  rcs: [
    ["Deliver", "delivered"],
    ["Read", "read"],
    ["Not Read", "notread"],
    ["Clicked", "clicked"],
    ["Not Clicked", "notclicked"],
    ["Unreachable", "unreachable"],
  ],
  webpush: [
    ["Push", "pushed"],
    ["View", "viewed"],
    ["Click", "clicked"],
    ["Not Click", "notclicked"],
    ["Dismiss", "dismissed"],
    ["Bounce", "bounced"],
  ],
};

const NAME = {
  mail: "Mail",
  sms: "SMS",
  whatsapp: "WhatsApp",
  rcs: "RCS",
  webpush: "Web Push",
};
const GROUPS = { addtogroup: "Add to Group" };
// every other group wording means the same thing
const TYPE_ALIAS = {
  movetogroup: "addtogroup",
  removefromgroup: "addtogroup",
  addgroup: "addtogroup",
  movegroup: "addtogroup",
  removegroup: "addtogroup",
  addtogroups: "addtogroup",
  movetogroups: "addtogroup",
};
// Date and Time has ONE outlet (Satisfy = Bottom3)
const SATISFY = { idx: 2, label: "Satisfy", key: "satisfy" };

const typeOf = (id) => String(id).replace("state_", "").split("_")[0];
const isChannel = (t) => !!EVENTS[t];
const isControl = (t) => t === "dateandtime";
const nm = (t) => NAME[t] || GROUPS[t] || (isControl(t) ? "Date and Time" : t);
const labelOf = (t) =>
  GROUPS[t] || (isControl(t) ? "Date and Time" : "Send " + NAME[t]);
const say = (message) => ({ message });
const clone = (o) => JSON.parse(JSON.stringify(o));
/* ---------- timing helpers (clock time, wait, slot, day, between dates) ---------- */
// Time zone of your users, minutes from UTC. India = 330. A controller can override it per user: session.utcOffsetMin = 330
const DEFAULT_UTC_OFFSET_MIN = 330;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const p2 = (n) => String(n).padStart(2, "0");
const offsetOf = (session) =>
  session && typeof session.utcOffsetMin === "number"
    ? session.utcOffsetMin
    : DEFAULT_UTC_OFFSET_MIN;
const ymd = (d) =>
  `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;

function localNow(session) {
  const d = new Date(Date.now() + offsetOf(session) * 60000);
  return {
    date: ymd(d),
    time: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`,
  };
}
const addDays = (s, n) => {
  const [y, m, d] = s.split("-").map(Number);
  return ymd(new Date(Date.UTC(y, m - 1, d + n)));
};

// "TODAY: 2026-11-04 18:10 (user's local time, UTC+05:30)"  -> append this to the system prompt next to BASE_TS
export function dateContext(session) {
  const n = localNow(session),
    o = offsetOf(session),
    a = Math.abs(o);
  return `TODAY: ${n.date} ${n.time} (user's local time, UTC${o < 0 ? "-" : "+"}${p2(Math.floor(a / 60))}:${p2(a % 60)})`;
}

// "5:30pm" | "5 30 pm" | "17:30" | "6pm"  ->  "17:30" (or null)
function parseClock(v) {
  const m = /^\s*(\d{1,2})(?:\s*[:.\s]\s*(\d{2}))?\s*([ap]\.?m\.?)?\s*$/i.exec(
    String(v || ""),
  );
  if (!m) return null;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0,
    ap = m[3] && m[3][0].toLowerCase();
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return `${p2(h)}:${p2(mi)}`;
}

// clock time of ONE action -> "YYYY-MM-DD HH:mm"   (null = no schedule / now, undefined = could not read it)
function scheduleOf(session, e) {
  if (!e.scheduleTime || e.scheduleTime === "now") return null;
  const t = parseClock(e.scheduleTime);
  if (!t) return undefined;
  const now = localNow(session);
  let d = /^\d{4}-\d{2}-\d{2}$/.test(String(e.scheduleDate || ""))
    ? e.scheduleDate
    : null;
  if (!d && e.scheduleDay === "tomorrow") d = addDays(now.date, 1);
  else if (!d && e.scheduleDay === "today") d = now.date;
  if (!d) d = t > now.time ? now.date : addDays(now.date, 1); // time already passed today -> tomorrow
  return `${d} ${t}`;
}

function setSchedule(wf, id, value) {
  const c = cfgOf(wf, id),
    s = stepOfNode(wf, id);
  if (value) {
    if (c) c.Schedule = value;
    if (s) s.action.args.scheduletime = value;
  } else {
    if (c) delete c.Schedule;
    if (s) delete s.action.args.scheduletime;
  }
}

// local "YYYY-MM-DD HH:mm" -> utc milliseconds
function toUtcMs(s, session) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(
    String(s || ""),
  );
  return m
    ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) -
        offsetOf(session) * 60000
    : null;
}
const utcStr = (ms) => {
  const d = new Date(ms);
  return `${ymd(d)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`;
};
const dayMon = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]}` : "";
};

function putTiming(wf, id, cond, value, title, days) {
  const c = cfgOf(wf, id),
    s = stepOfNode(wf, id);
  if (c)
    Object.assign(c, {
      Value: value,
      Title: title,
      Datecondition: cond,
      DaysOfWeek: days,
      IsDynamicGroup: "0",
      IgnoreWeekend: false,
    });
  if (s)
    Object.assign(s.action.args, {
      datecondition: cond,
      datevalue: value,
      daysofweek: days,
      isdynamicgroup: false,
      ignoreweekend: false,
    });
}

// sets the timing of a Date and Time node. returns false when the words could not be used
function setTiming(wf, id, e, session) {
  const kind = e.timing || (e.waitN && e.waitUnit ? "wait" : null);
  if (kind === "wait") {
    if (!(parseInt(e.waitN, 10) >= 1)) return false;
    setWait(wf, id, e.waitN, e.waitUnit);
    return true;
  }
  if (kind === "slot") {
    const f = parseClock(e.slotFrom),
      t = parseClock(e.slotTo);
    if (!f || !t || t <= f) return false;
    const day = String(e.day || "anyday").toLowerCase();
    putTiming(
      wf,
      id,
      8,
      `${f}~${t}`,
      `Slot B/w ${f} to ${t}`,
      day === "anyday" || WEEKDAYS.includes(day) ? day : "anyday",
    );
    return true;
  }
  if (kind === "day") {
    const day = String(e.day || "").toLowerCase();
    if (!WEEKDAYS.includes(day)) return false;
    putTiming(
      wf,
      id,
      9,
      "",
      "Preferred: " + day[0].toUpperCase() + day.slice(1),
      day,
    );
    return true;
  }
  if (kind === "between") {
    const a = toUtcMs(e.fromDt, session),
      b = toUtcMs(e.toDt, session);
    if (a === null || b === null || a <= Date.now() || (b - a) / 60000 < 60)
      return false;
    putTiming(
      wf,
      id,
      4,
      `${utcStr(a)}~${utcStr(b)}`,
      `B/w ${dayMon(e.fromDt)} to ${dayMon(e.toDt)}`,
      "",
    );
    return true;
  }
  return false;
}

// the small model often misses timing words: read them from the sentence as well
const NUMW = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  sixty: 60,
};
const numOf = (w) =>
  /^\d+$/.test(String(w)) ? +w : NUMW[String(w).toLowerCase()];
const unitOf = (u) =>
  /^min/i.test(u) ? "Minutes" : /^(hour|hr)/i.test(u) ? "Hours" : "Days";

function timingFromText(t) {
  const out = {};
  // "after one hour", "wait 30 minutes", "delay 2 days", "after a day"
  let m =
    /\b(?:after|wait(?:\s+for)?|delay(?:ed)?(?:\s+by)?)\s+(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|sixty)\s*(minute|min|hour|hr|day)s?\b/i.exec(
      t,
    );
  if (m) {
    out.timing = "wait";
    out.waitN = numOf(m[1]);
    out.waitUnit = unitOf(m[2]);
  } else if (
    /\b(?:after|wait(?:\s+for)?|delay(?:ed)?(?:\s+by)?)\s+half\s+an?\s+hour\b/i.test(
      t,
    )
  ) {
    out.timing = "wait";
    out.waitN = 30;
    out.waitUnit = "Minutes";
  }
  // clock time: "at 5:30 pm", "at 5 30 pm", "at 17:30"
  m =
    /\bat\s+(\d{1,2})(?:\s*[:.\s]\s*(\d{2}))?\s*(am|pm)\b/i.exec(t) ||
    /\bat\s+(\d{1,2})\s*[:.]\s*(\d{2})\b/i.exec(t);
  if (m)
    out.scheduleTime = parseClock(m[1] + ":" + (m[2] || "00") + (m[3] || ""));
  if (/\btomorrow\b/i.test(t)) out.scheduleDay = "tomorrow";
  else if (/\btoday\b/i.test(t)) out.scheduleDay = "today";
  return out;
}
/* ---------- save / update / new version / draft wording ---------- */
const SAVE =
  /^\s*(?:skip(?: all)?(?: and| then)?\s+)?(?:yes|y|yeah|ok|okay|save|update|confirm|go ahead|proceed)(?:\s+(?:it|this|the|my|now))*(?:\s+(?:workflow|flow|agent))?\s*[.!]*\s*$/i;
const UPDATE =
  /^\s*(?:yes[,\s]*)?(?:please\s+)?(?:update|overwrite|replace)(?:\s+(?:it|this|the|my|existing|workflow|flow|agent|now))*\s*[.!]*\s*$/i;
const NEWVER =
  /\b(?:new\s*version|newversion|create\s+(?:a\s+)?new|save\s+as\s+(?:a\s+)?new|as\s+(?:a\s+)?new|new\s+(?:one|copy))\b/i;
// "save as draft", "keep it as a draft", "update as draft", "new version as draft", "draft"
// (a group or template that merely has the word "draft" in its name is NOT matched)
const DRAFT =
  /\b(?:save|keep|store|update|make|as)\b[^.]*\bdraft\b|^\s*(?:a\s+)?draft\s*[.!]*\s*$/i;
const SKIP_START = /^\s*skip\b/i;
const COMMAND =
  /\b(add|remove|delete|send|also|then|change|replace|preview|save|those|who|if|when|after|schedule|wait|delay)\b|\bat\s+\d|\b(?:\d+|an?|one|two|three|four|five|six|ten|half)\s*(?:minutes?|hours?|days?|an\s+hour)\b/i;
const stripSkip = (t) => t.replace(/^\s*skip(?: all)?(?: and| then)?\s+/i, "");
const modeOf = (session) => (session && session.wfMode) || "create";
const isSaveWord = (t, mode) =>
  SAVE.test(t) ||
  DRAFT.test(t) ||
  (mode === "edit" && (UPDATE.test(stripSkip(t)) || NEWVER.test(t)));

const INTENT_PROMPT = `You read ONE user message about an existing messaging workflow and output ONE minified JSON object. No prose, no code fences.
Shape:
{"intent":"add|remove|set_template|set_schedule|set_timing|question|new|other","channel":"mail|sms|whatsapp|rcs|webpush|addtogroup|dateandtime|null","parentChannel":"mail|sms|whatsapp|rcs|webpush|dateandtime|null","parentStep":null,"event":null,"sequence":false,"step":null,"template":null,"group":null,"beforeChannel":null,"beforeStep":null,"scheduleTime":null,"scheduleDate":null,"scheduleDay":null,"timing":null,"waitN":null,"waitUnit":null,"slotFrom":null,"slotTo":null,"day":null,"fromDt":null,"toDt":null}
Rules:
- add: the user wants a new action ("also send...", "add...", "then..."). channel = the NEW action.
- Any wording about putting contacts into a group (add, move, put, include, copy, shift "to/into group X") -> channel = "addtogroup", group = the group name only (drop "this", "the", "group").
- dateandtime: a Date and Time / wait / delay step. channel = "dateandtime".
- parentChannel = channel of the message whose event triggers the new action ("those who open the mail" -> mail). null when the new action does not depend on any message.
- parentStep = a number only when the user said one ("step 3", "second mail" = the step number of the 2nd mail in the list below). Otherwise null.
- event (one of delivered, sent, opened, notopened, clicked, notclicked, bounced, read, notread, failed, unreachable, pushed, viewed, dismissed): received/delivered -> delivered; sent/has been sent -> sent; open/opens/opened -> opened; did not open -> notopened; click -> clicked; did not click -> notclicked; bounce -> bounced; read/seen -> read; unread -> notread. Otherwise null.
- sequence = true when the user only says "then"/"after that" with no event and no parent channel.
- beforeChannel = channel of the step that must come right AFTER a new Date and Time ("add date time in between audience and the mail" -> mail; "before the sms" -> sms). beforeStep = a number only when the user said one. Otherwise null.
TIMING (the TRIGGER and the TIMING are different things):
- scheduleTime = the CLOCK time at which the new (or target) action runs: "at 5:30 pm", "at 5 30 pm", "at 6pm" -> 24-hour "HH:mm" ("17:30"). "now" / "immediately" / "send now" -> "now". It is NOT part of the trigger: in "send a mail to those who click the link at 5 30 pm" the trigger is the click and 5:30 pm is the schedule of the new mail.
- scheduleDate = "YYYY-MM-DD" only when the user said a date. scheduleDay = "today" or "tomorrow" only when the user said it. Use the TODAY line below.
- timing = "wait" for "after 2 hours", "after one hour", "wait 30 minutes", "delay a day", "after half an hour" (waitN = the number even when written as a word: one -> 1, two -> 2; half an hour -> 30 Minutes; waitUnit = Minutes|Hours|Days). "after the mail is opened" has NO time unit: that is an event, not a wait.- timing = "slot" for "between 10 am and 12 pm" (slotFrom, slotTo as 24-hour HH:mm; day = a weekday in lower case or "anyday").
- timing = "day" for "on Mondays" / "preferred day Friday" (day = weekday in lower case).
- timing = "between" for a date range "between 5 Oct 10:00 and 7 Oct 18:00" (fromDt, toDt as "YYYY-MM-DD HH:mm").
- A timing together with a new message or group action: keep channel = the new action; the application puts the Date and Time step in front of it.
- set_schedule: the user changes / sets / removes the clock time of an EXISTING step ("change the mail time to 6 pm", "schedule the sms at 9 am", "send the mail now"). channel or step + scheduleTime.
- set_timing: the user changes the wait / slot / day of an EXISTING Date and Time step. channel = "dateandtime" (+ step when said) + the timing fields.
- remove: channel + step. set_template: channel or step + template (only text the user wrote).
- group = destination group name for group actions, only if the user wrote it.
- new = wants a different/new workflow. question = asks about the workflow. other = anything else.`;

/* ---------- lookups ---------- */
function stepOfNode(wf, id) {
  const i = wf.flowchartConfig.nodes.findIndex((n) => n.blockId === id);
  return i > 0 ? wf.steps[i - 1] : null;
}
function listOf(wf, type) {
  return wf.flowchartConfig.nodes
    .map((n, i) => ({ blockId: n.blockId, num: i }))
    .filter((x) => x.num > 0 && typeOf(x.blockId) === type)
    .map((x) => ({ ...x, step: wf.steps[x.num - 1] }));
}
function cfgOf(wf, id) {
  return wf.configarray.find((c) => c.Channel === id);
}

// "Send SMS after #1 Send WhatsApp (Clicked)"  /  "Send Mail from the Audience"
function stepDesc(wf, num) {
  const nodes = wf.flowchartConfig.nodes,
    node = nodes[num];
  if (!node) return `step ${num}`;
  const c = wf.flowchartConfig.connections.find(
    (x) => x.TargetId === node.blockId,
  );
  const pIdx = c ? nodes.findIndex((n) => n.blockId === c.SourceId) : 0;
  const where =
    pIdx <= 0
      ? "from the Audience"
      : `after #${pIdx} ${labelOf(typeOf(c.SourceId))} (${c.RelationWithParent})`;
  return `${labelOf(typeOf(node.blockId))} ${where}`;
}
const stepLabel = (wf, num) => `#${num} ${stepDesc(wf, num)}`;

function pick(wf, type, num) {
  const c = listOf(wf, type);
  if (!c.length)
    return {
      error: `There is no ${nm(type)} step in '${wf.name}'. Add one first, or tell me which step you mean.`,
    };
  if (num) {
    const hit = c.find((x) => x.num === Number(num));
    return hit
      ? { id: hit.blockId }
      : { error: `Step #${num} is not a ${nm(type)} step.` };
  }
  if (c.length === 1) return { id: c[0].blockId };
  return {
    cands: c.map((x) => x.num),
    ask:
      `Which ${nm(type)} do you mean? ` +
      c.map((x) => stepLabel(wf, x.num)).join(", or ") +
      `. Reply with the step number (the # on the step in the preview).`,
  };
}
function resolveEvent(pt, key) {
  const list = EVENTS[pt];
  const i = key
    ? list.findIndex((e) => e[1] === key)
    : list.findIndex((e) => e[1] === "delivered" || e[1] === "pushed");
  if (i < 0)
    return {
      error: `${NAME[pt]} has no "${key}" event. Its events are: ${list.map((e) => e[0]).join(", ")}. Which one do you mean?`,
    };
  return { idx: i, label: list[i][0], key: list[i][1] };
}

/* ---------- configuration check (mirrors the validation of the preview popups) ---------- */
const lowerKeys = (o) => {
  const r = {};
  Object.keys(o || {}).forEach((k) => (r[k.toLowerCase()] = o[k]));
  return r;
};
const blank = (v) =>
  v === undefined || v === null || v === "" || v === 0 || v === "0";
// NOTHING is mandatory for a channel step: template, configuration name, subject,
// from name, from email and reply-to are the user's choice. Whatever is given is passed
// to C# as it is; whatever is missing, the sender fills with its defaults.
// Set a flag to true to require that setting again.
const CHAN_NEEDS = {
  mail: { template: false, cfg: false, mail: false },
  sms: { template: false, cfg: false },
  whatsapp: { template: false, cfg: false },
  rcs: { template: false, cfg: false },
  webpush: { template: false },
};

// returns [{ step, name, missing: [...] }]  (step 0 = the Audience)
export function findIncomplete(wf) {
  const out = [];
  const nodes = (wf && wf.flowchartConfig && wf.flowchartConfig.nodes) || [];
  if (!nodes.length) return out;

  const aud = cfgOf(wf, nodes[0].blockId);
  const audQuery = aud && String(aud.Value || "").trim();
  if (!audQuery) out.push({ step: 0, name: "Audience", missing: ["audience"] });

  (wf.steps || []).forEach((s, i) => {
    const node = nodes[i + 1];
    if (!node) return;
    const t = typeOf(node.blockId);
    const a = lowerKeys(s.action && s.action.args);
    const m = [];

    if (isChannel(t)) {
      const need = CHAN_NEEDS[t] || {};
      if (need.template && blank(a.templateid) && blank(a.templatename))
        m.push("template");
      if (need.cfg && blank(a.configurationnameid))
        m.push("configuration name");
      if (need.mail) {
        if (!String(a.subject || "").trim()) m.push("subject");
        if (!String(a.fromname || "").trim()) m.push("from name");
        if (!String(a.fromemailid || "").trim()) m.push("from email");
        if (!String(a.replytoemailid || "").trim()) m.push("reply-to email");
      }
    } else if (GROUPS[t]) {
      if (!String(a.groupname || "").trim()) m.push("group name");
    } else if (t === "addrules") {
      if (blank(a.ruleid)) m.push("rule");
    } else if (isControl(t)) {
      if (a.datecondition === undefined || a.datecondition === null)
        m.push("date and time");
    }

    if (m.length)
      out.push({ step: i + 1, name: stepDesc(wf, i + 1), missing: m });
  });
  return out;
}

const missingLines = (list) =>
  list
    .map((x) =>
      x.step === 0
        ? `- Audience: ${x.missing.join(", ")}`
        : `- #${x.step} ${x.name}: ${x.missing.join(", ")}`,
    )
    .join("\n");

// text placed in front of the final question while something is missing
export function incompleteNote(wf) {
  const list = findIncomplete(wf);
  if (!list.length) return "";
  return (
    `Some settings are still missing:\n${missingLines(list)}\n` +
    `If you continue now, the workflow is saved as a draft and will not start. ` +
    `Click "Preview workflow" and set these configurations to activate it.`
  );
}

/* ---------- edits ---------- */
function addNode(wf, e, parentId, ev, session) {
  const f = wf.flowchartConfig,
    nodes = f.nodes,
    type = e.channel,
    group = !!GROUPS[type],
    ctl = isControl(type);
  const root = nodes[0].blockId,
    isRoot = parentId === root;
  const maxTs = Math.max(
    ...nodes.map((n) => Number(String(n.blockId).split("_").pop()) || 0),
  );
  const id = `state_${type}_${maxTs + 1000}`;
  const parent = nodes.find((n) => n.blockId === parentId);
  const kids = f.connections
    .filter((c) => c.SourceId === parentId)
    .map((c) => nodes.find((n) => n.blockId === c.TargetId))
    .filter(Boolean);
  const y = parent.positionY + 130;
  let x = kids.length
    ? Math.max(...kids.map((k) => k.positionX)) + 340
    : parent.positionX;
  while (nodes.some((n) => n.positionX === x && n.positionY === y)) x += 340;

  nodes.push({ blockId: id, positionX: x, positionY: y, label: labelOf(type) });
  f.connections.push({
    connectionId: "",
    SourceId: parentId,
    TargetId: id,
    anchor: isRoot ? "Bottom3" : "Bottom" + (ev.idx + 1),
    RelationWithParent: isRoot ? "Satisfy" : ev.label,
  });

  const val = group
    ? e.group
    : ctl
      ? "dateandtime_template"
      : e.template || type + "_template";
  wf.configarray.push({ Channel: id, Value: val, Title: val });

  wf.steps.push(makeStep(wf, type, parentId, ev, val));
  if (ctl) setTiming(wf, id, e, session);
  return id;
}
/* ---------- group audience: configarray Value = "12,15" (group ids) ---------- */
const IDS = /^\d+(\s*,\s*\d+)*$/;
function groupAudience(wf) {
  const root = wf.flowchartConfig.nodes[0].blockId;
  const v = String((cfgOf(wf, root) || {}).Value || "").trim();
  return IDS.test(v) ? v : "";
}
// text for getquery: the audience text, or for groups the query the existing root steps already carry
function audienceQuery(wf) {
  const root = wf.flowchartConfig.nodes[0].blockId,
    ids = groupAudience(wf);
  if (!ids) return (cfgOf(wf, root) || {}).Value || "";
  const s = (wf.steps || []).find(
    (x) =>
      x.action &&
      x.action.args &&
      x.action.args.audiencetype === "group" &&
      x.action.args.getquery,
  );
  return s ? s.action.args.getquery : "contacts from group " + ids;
}
// one step object for a node (used when adding AND when healing a broken workflow)
function makeStep(wf, type, parentId, ev, val) {
  const root = wf.flowchartConfig.nodes[0].blockId,
    isRoot = parentId === root;
  const group = !!GROUPS[type],
    ctl = isControl(type);
  const pStep = isRoot ? null : stepOfNode(wf, parentId);
  const query = audienceQuery(wf);
  const args = group
    ? { actiontype: type }
    : ctl
      ? { controltype: type }
      : { channel: type };

  if (isRoot) {
    args.getquery = query;
    const gids = groupAudience(wf);
    if (gids) {
      args.audiencetype = "group";
      args.groupids = gids;
    }
  } else {
    args.getreposechannel = typeOf(parentId);
    args.eventName = ev.key;
  }
  if (group) args.groupname = val;
  Object.assign(args, {
    type: 0,
    isworkflow: true,
    agentworkflowid: "{{agentworkflowid}}",
    agenttaskid: "",
  });
  if (!group && !ctl) args.templatename = val;
  args.taskrepeatedvalues = !!(
    pStep && pStep.action.args.taskrepeatedvalues === true
  );
  const what = `${labelOf(type)}${group ? " " + val : ""}`;
  return {
    id: "",
    order: 0,
    type: "action",
    dependsOn: "",
    name: isRoot
      ? `${what} ${ctl ? "for" : "to"} ${query}`
      : `${what} on ${nm(typeOf(parentId))} ${ev.label}`,
    action: { module: "reporting", args },
  };
}

// the event row of a connection (parent -> child)
function connEvent(wf, c) {
  const pt = typeOf(c.SourceId);
  if (c.SourceId === wf.flowchartConfig.nodes[0].blockId) return null; // Audience
  if (isControl(pt)) return SATISFY;
  const list = EVENTS[pt] || [];
  const i = list.findIndex((x) => x[0] === c.RelationWithParent);
  const k = i >= 0 ? i : 0;
  return { idx: k, label: list[k][0], key: list[k][1] };
}

// wait = Date and Time with datecondition 0 ("2 Hours")
function setWait(wf, id, n, unit) {
  const num = parseInt(n, 10);
  if (!(num >= 1)) return;
  const u =
    ["Minutes", "Hours", "Days"].find(
      (x) => x.toLowerCase() === String(unit).toLowerCase(),
    ) || "Hours";
  const value = `${num} ${u}`;
  const c = cfgOf(wf, id);
  if (c)
    Object.assign(c, {
      Value: value,
      Title: value,
      Datecondition: 0,
      DaysOfWeek: "",
      IsDynamicGroup: "0",
      IgnoreWeekend: false,
    });
  const s = stepOfNode(wf, id);
  if (s)
    Object.assign(s.action.args, {
      datecondition: 0,
      datevalue: value,
      daysofweek: "",
      isdynamicgroup: false,
      ignoreweekend: false,
    });
}

// put a new Date and Time node between a step and its parent
function insertBefore(wf, e, targetId, session) {
  const f = wf.flowchartConfig,
    nodes = f.nodes,
    root = nodes[0].blockId;
  const tConn = f.connections.find((c) => c.TargetId === targetId);
  const parentId = tConn ? tConn.SourceId : root;
  const ev = tConn ? connEvent(wf, tConn) : null;
  const tNode = nodes.find((n) => n.blockId === targetId);
  const tArgs = stepOfNode(wf, targetId).action.args;
  const maxTs = Math.max(
    ...nodes.map((n) => Number(String(n.blockId).split("_").pop()) || 0),
  );
  const id = `state_dateandtime_${maxTs + 1000}`;

  // the moved step and everything under it go one row down
  const sub = new Set([targetId]);
  for (let grew = true; grew; ) {
    grew = false;
    f.connections.forEach((c) => {
      if (sub.has(c.SourceId) && !sub.has(c.TargetId)) {
        sub.add(c.TargetId);
        grew = true;
      }
    });
  }
  const x = tNode.positionX,
    y = tNode.positionY;
  nodes.forEach((n) => {
    if (sub.has(n.blockId)) n.positionY += 130;
  });

  nodes.push({
    blockId: id,
    positionX: x,
    positionY: y,
    label: "Date and Time",
  });
  if (tConn)
    tConn.TargetId = id; // parent -> Date and Time (same anchor / event)
  else
    f.connections.push({
      connectionId: "",
      SourceId: root,
      TargetId: id,
      anchor: "Bottom3",
      RelationWithParent: "Satisfy",
    });
  f.connections.push({
    connectionId: "",
    SourceId: id,
    TargetId: targetId,
    anchor: "Bottom3",
    RelationWithParent: "Satisfy",
  });
  wf.configarray.push({
    Channel: id,
    Value: "dateandtime_template",
    Title: "dateandtime_template",
  });

  // the Date and Time step takes over what the moved step had
  const dStep = makeStep(
    wf,
    "dateandtime",
    parentId,
    ev,
    "dateandtime_template",
  );
  if (parentId === root && tArgs.getquery)
    dStep.action.args.getquery = tArgs.getquery;
  dStep.action.args.taskrepeatedvalues = tArgs.taskrepeatedvalues === true;
  wf.steps.push(dStep);

  // the moved step becomes a child of the Date and Time node
  delete tArgs.getquery;
  delete tArgs.audiencetype;
  delete tArgs.groupids;
  tArgs.getreposechannel = "dateandtime";
  tArgs.eventName = "satisfy";
  setTiming(wf, id, e, session);
}
/* ---------- repair group actions in the JSON the LLM wrote ----------
   - move / remove / wrong ids -> addtogroup
   - a group is never a parent: its children move up to the group's parent
   - group step = actiontype + groupname only; name kept in step and configarray */
function fixGroups(wf) {
  const f = wf && wf.flowchartConfig;
  if (!f || !Array.isArray(f.nodes) || !f.nodes.length) return wf;
  wf.steps = wf.steps || [];
  wf.configarray = wf.configarray || [];

  // 1. rename ids
  const fix = (id) => {
    const m = String(id || "").match(/^state_([A-Za-z]+)_(.+)$/);
    const t = m && TYPE_ALIAS[m[1].toLowerCase()];
    return t ? `state_${t}_${m[2]}` : id;
  };
  f.nodes.forEach((n) => {
    n.blockId = fix(n.blockId);
  });
  f.connections.forEach((c) => {
    c.SourceId = fix(c.SourceId);
    c.TargetId = fix(c.TargetId);
  });
  wf.configarray.forEach((c) => {
    c.Channel = fix(c.Channel);
  });
  wf.steps.forEach((s) => {
    const a = s.action && s.action.args;
    if (a && a.actiontype && TYPE_ALIAS[String(a.actiontype).toLowerCase()])
      a.actiontype = "addtogroup";
  });

  // 2. a group is never a parent: hang its children on the group's parent
  const root = f.nodes[0].blockId,
    rebuild = new Set();
  for (let guard = 0; guard < 20; guard++) {
    const bad = f.connections.find((c) => GROUPS[typeOf(c.SourceId)]);
    if (!bad) break;
    const pc = f.connections.find((x) => x.TargetId === bad.SourceId);
    bad.SourceId = pc ? pc.SourceId : root;
    bad.anchor = pc ? pc.anchor : "Bottom3";
    bad.RelationWithParent = pc ? pc.RelationWithParent : "Satisfy";
    rebuild.add(bad.TargetId); // its step is rebuilt by heal()
  }
  if (rebuild.size) {
    wf.steps = wf.steps.filter((s, k) => {
      const num = parseInt(String(s.id || "").replace("step", ""), 10) || k + 1;
      const node = f.nodes[num];
      return !(node && rebuild.has(node.blockId));
    });
  }

  // 3. group steps: clean args, group name in step and configarray
  wf.steps.forEach((s, k) => {
    const num = parseInt(String(s.id || "").replace("step", ""), 10) || k + 1;
    const node = f.nodes[num];
    if (!node || !GROUPS[typeOf(node.blockId)]) return;
    const a = (s.action.args = (s.action && s.action.args) || {});
    const c = cfgOf(wf, node.blockId);
    const name = String(a.groupname || (c && c.Value) || "")
      .replace(/_template$/, "")
      .trim();
    delete a.channel;
    delete a.templatename;
    delete a.templateid;
    a.actiontype = "addtogroup";
    if (name) {
      a.groupname = name;
      if (c) {
        c.Value = name;
        c.Title = name;
      }
    }
  });
  return wf;
}
// make nodes, steps and configarray line up (step N <-> node N); rebuild missing steps from the node + connection
function heal(wf) {
  fixGroups(wf);
  const f = wf.flowchartConfig,
    nodes = f.nodes,
    old = wf.steps || [];
  wf.configarray = wf.configarray || [];
  nodes.forEach((n, i) => {
    if (i > 0 && !cfgOf(wf, n.blockId)) {
      const t = typeOf(n.blockId),
        v = GROUPS[t] ? "" : t + "_template";
      wf.configarray.push({ Channel: n.blockId, Value: v, Title: v });
    }
  });
  const byNo = {};
  old.forEach((s, k) => {
    byNo[parseInt(String(s.id || "").replace("step", ""), 10) || k + 1] = s;
  });
  const steps = [];
  for (let i = 1; i < nodes.length; i++) {
    const t = typeOf(nodes[i].blockId),
      s = byNo[i],
      a = s && s.action && s.action.args;
    if (a && (a.channel === t || a.actiontype === t || a.controltype === t)) {
      steps.push(s);
      continue;
    }
    let c = f.connections.find((x) => x.TargetId === nodes[i].blockId);
    if (!c) {
      c = {
        connectionId: "",
        SourceId: nodes[0].blockId,
        TargetId: nodes[i].blockId,
        anchor: "Bottom3",
        RelationWithParent: "Satisfy",
      };
      f.connections.push(c);
    }
    const pid = c.SourceId,
      pt = typeOf(pid);
    const row =
      pid !== nodes[0].blockId
        ? (EVENTS[pt] || []).findIndex((e) => e[0] === c.RelationWithParent)
        : -1;
    const ev = isControl(pt)
      ? SATISFY
      : row >= 0
        ? { idx: row, label: EVENTS[pt][row][0], key: EVENTS[pt][row][1] }
        : { idx: 0, label: "Deliver", key: "delivered" };
    steps.push(
      makeStep({ ...wf, steps }, t, pid, ev, cfgOf(wf, nodes[i].blockId).Value),
    );
    const cs = cfgOf(wf, nodes[i].blockId);
    if (cs && cs.Schedule)
      steps[steps.length - 1].action.args.scheduletime = cs.Schedule;
  }
  wf.steps = steps;
  return rebuild(wf);
}

function removeSubtree(wf, blockId) {
  const f = wf.flowchartConfig,
    drop = new Set([blockId]);
  for (let grew = true; grew; ) {
    grew = false;
    f.connections.forEach((c) => {
      if (drop.has(c.SourceId) && !drop.has(c.TargetId)) {
        drop.add(c.TargetId);
        grew = true;
      }
    });
  }
  wf.steps = wf.steps.filter((s, k) => !drop.has(f.nodes[k + 1].blockId));
  f.nodes = f.nodes.filter((n) => !drop.has(n.blockId));
  f.connections = f.connections.filter(
    (c) => !drop.has(c.SourceId) && !drop.has(c.TargetId),
  );
  wf.configarray = wf.configarray.filter((c) => !drop.has(c.Channel));
}

function setTemplate(wf, id, name) {
  const c = cfgOf(wf, id);
  if (c) {
    c.Value = name;
    c.Title = name;
  }
  const s = stepOfNode(wf, id);
  if (s) {
    s.action.args.templatename = name;
    delete s.action.args.templateid;
  }
}

// recompute ids, order, dependsOn, agenttaskid from the tree
function rebuild(wf) {
  const f = wf.flowchartConfig,
    nodes = f.nodes,
    idx = {};
  nodes.forEach((n, i) => (idx[n.blockId] = i));
  f.connections.forEach((c, i) => (c.connectionId = "con_" + (i + 1)));
  f.numberOfElements = nodes.length;
  wf.steps.forEach((s, k) => {
    const i = k + 1,
      id = "step" + i;
    const c = f.connections.find((x) => x.TargetId === nodes[i].blockId);
    const root = !c || c.SourceId === nodes[0].blockId;
    s.id = id;
    s.order = i;
    s.dependsOn = root ? "step0" : "step" + idx[c.SourceId];
    s.action.args.agenttaskid = root ? id : s.dependsOn;
  });
  return wf;
}

/* ---------- reply building ---------- */
// create / reuse: "save". edit: "update or create a new version".
// The user can always answer "save as draft". When settings are missing, a note is placed in front of the question.
export const saveQuestion = (wf, session) => {
  const q =
    modeOf(session) === "edit"
      ? `Would you like to update '${wf.name}' or create a new version? Reply "update", "new version" or "save as draft", or tell me what to change.`
      : `Would you like me to save this workflow '${wf.name}'? Reply "yes" to save, "save as draft" to keep it as a draft, or tell me what to change.`;
  const note = incompleteNote(wf);
  return note ? note + "\n" + q : q;
};

// LLM-written replies end with the plain save / update sentence: swap it for the app's version
// (mode wording + missing-settings note). Works for create, edit and reuse.
export function fixSaveQuestion(message, wf, session) {
  return String(message).replace(
    /(?:Would you like me to save this workflow|Would you like to update ).*$/m,
    () => saveQuestion(wf, session),
  );
}

function summary(wf) {
  const lines = wf.steps.map((s, i) => {
    const node = wf.flowchartConfig.nodes[i + 1],
      t = typeOf(node.blockId),
      c = cfgOf(wf, node.blockId);
    const v = !c
      ? ""
      : isControl(t)
        ? c.Datecondition != null
          ? c.Title
          : "timing not set yet - click Preview workflow to set it"
        : isChannel(t) && (!c.Value || c.Value === t + "_template")
          ? "template not set yet"
          : c.Value;
    const sch = c && c.Schedule ? ` - scheduled at ${c.Schedule}` : "";
    return `${stepLabel(wf, i + 1)} - ${v}${sch}`;
  });
  return `Summary of '${wf.name}':\n` + lines.join("\n");
}

function nextQuestion(wf, session) {
  const skipped = session.wfSkipped || [],
    nodes = wf.flowchartConfig.nodes;
  for (let i = 1; i < nodes.length; i++) {
    const t = typeOf(nodes[i].blockId),
      c = cfgOf(wf, nodes[i].blockId);
    if (
      isChannel(t) &&
      c &&
      (!c.Value || c.Value === t + "_template") &&
      !skipped.includes(nodes[i].blockId)
    ) {
      session.wfPending = { kind: "template", blockId: nodes[i].blockId };
      return `${stepLabel(wf, i)} has no template yet in '${wf.name}'. Which template should I use? (Reply "skip" to keep the placeholder, or "save as draft" to save it as a draft now.)`;
    }
  }
  session.wfPending = null;
  return saveQuestion(wf, session);
}

function done(wf, session, withSummary) {
  rebuild(wf);
  const q = nextQuestion(wf, session);
  return {
    wf,
    message:
      JSON.stringify(wf) + "\n" + (withSummary ? summary(wf) + "\n" : "") + q,
  };
}

// what to send to SaveAgentWorkFlow, based on the mode and what the user answered
// draft = true -> the app saves with status false, even when every step is configured
function saveResult(wf, session, t) {
  const mode = modeOf(session),
    s = stripSkip(t);
  const draft = DRAFT.test(s);
  if (mode === "edit") {
    const pid = Number(session.wfPid) || 0;
    if (NEWVER.test(s))
      return { save: true, wf, actiontype: "newversion", pid, draft };
    // "save as draft" while editing = update the opened workflow as a draft
    if (UPDATE.test(s) || draft)
      return { save: true, wf, actiontype: pid ? "edit" : "save", pid, draft };
    // a bare "yes" / "save" is ambiguous when editing
    return say(
      `Do you want to update '${wf.name}' or create a new version? Reply "update", "new version" or "save as draft".`,
    );
  }
  return {
    save: true,
    wf,
    actiontype: mode === "reuse" ? "reuse" : "save",
    pid: 0, // pid: only edit / newversion send the id
    draft,
  };
}

// call after the LLM created a workflow, so a template answer is understood next turn
export function primePending(wf, session) {
  session.wfSkipped = [];
  nextQuestion(wf, session);
}

export function validateWorkflow(wf) {
  const f = wf && wf.flowchartConfig;
  if (
    !f ||
    !Array.isArray(f.nodes) ||
    !Array.isArray(f.connections) ||
    !Array.isArray(wf.steps) ||
    !Array.isArray(wf.configarray)
  )
    return false;
  const n = f.nodes.length,
    ids = new Set(f.nodes.map((x) => x.blockId));
  return (
    n > 1 &&
    f.connections.length === n - 1 &&
    wf.steps.length === n - 1 &&
    wf.configarray.length === n &&
    f.connections.every((c) => ids.has(c.SourceId) && ids.has(c.TargetId)) &&
    wf.steps.every((s) => s.action && s.action.args)
  );
}

/* ---------- apply one classified edit ---------- */
function apply(wf, session, e) {
  const nodes = wf.flowchartConfig.nodes,
    root = nodes[0].blockId;

  if (e.intent === "add") {
    const type = e.channel;
    if (!isChannel(type) && !GROUPS[type] && !isControl(type))
      return say(
        "I can add Send Mail, SMS, WhatsApp, RCS, Web Push, Date and Time, or Add to Group steps. Which one do you want?",
      );
    if (GROUPS[type] && !e.group) {
      session.wfPending = { kind: "group", edit: e };
      return say("Which group should the contacts be added to?");
    }

    // clock time of the new action ("at 5:30 pm")
    const schedule = isControl(type) ? null : scheduleOf(session, e);
    if (schedule === undefined)
      return say(
        'I could not read that time. Please say it like "at 5:30 pm" or "at 17:30".',
      );

    // Date and Time "in between": it goes before an existing step
    if (isControl(type)) {
      let beforeId = null;
      if (e.beforeChannel || e.beforeStep) {
        const bt =
          e.beforeChannel ||
          typeOf(nodes[e.beforeStep] ? nodes[e.beforeStep].blockId : "");
        const r = pick(wf, bt, e.beforeStep);
        if (r.error) return say(r.error);
        if (r.ask) {
          session.wfPending = {
            kind: "pick",
            field: "beforeStep",
            cands: r.cands,
            edit: e,
          };
          return say(r.ask);
        }
        beforeId = r.id;
      } else if (e.between && !e.parentChannel) {
        const c0 = wf.flowchartConfig.connections.find(
          (c) => c.SourceId === root,
        ); // first step under the Audience
        if (c0) beforeId = c0.TargetId;
      }
      if (beforeId) {
        insertBefore(wf, e, beforeId, session);
        return done(wf, session, true);
      }
    }

    let parent = root,
      ev = null,
      pt = e.parentChannel;
    if (!pt && e.sequence) {
      const last = [...nodes]
        .reverse()
        .find((n) => isChannel(typeOf(n.blockId)));
      if (last) {
        pt = typeOf(last.blockId);
        e.parentStep = e.parentStep || nodes.indexOf(last);
      }
    }
    if (pt) {
      if (!isChannel(pt) && !isControl(pt))
        return say(
          "A group step cannot have a next step. Which message should this follow?",
        );
      const r = pick(wf, pt, e.parentStep);
      if (r.error) return say(r.error);
      if (r.ask) {
        session.wfPending = {
          kind: "pick",
          field: "parentStep",
          cands: r.cands,
          edit: e,
        };
        return say(r.ask);
      }
      parent = r.id;
      ev = isControl(pt) ? SATISFY : resolveEvent(pt, e.event);
      if (ev.error) {
        session.wfPending = { kind: "event", pt, edit: e };
        return say(ev.error);
      }
    }
    if (ev && !e.force) {
      const hit = wf.flowchartConfig.connections.find(
        (c) =>
          c.SourceId === parent &&
          c.anchor === "Bottom" + (ev.idx + 1) &&
          typeOf(c.TargetId) === type,
      );
      if (hit) {
        const num = nodes.findIndex((n) => n.blockId === hit.TargetId);
        session.wfPending = { kind: "dup", edit: e };
        return say(
          `${stepLabel(wf, num)} already does this. Reply "add another" to add a second one, or tell me what to change.`,
        );
      }
    }

    // wait / slot / day / between dates in front of a message or group action:
    // parent -> Date and Time -> new action
    if (!isControl(type) && e.timing) {
      parent = addNode(
        wf,
        { ...e, channel: "dateandtime" },
        parent,
        ev,
        session,
      );
      ev = SATISFY;
    }
    const newId = addNode(wf, e, parent, ev, session);
    if (schedule) setSchedule(wf, newId, schedule);
    return done(wf, session, true);
  }

  if (e.intent === "remove") {
    if (!e.channel && !e.step)
      return say("Which step should I remove? Tell me the step number (#).");
    const type =
      e.channel || typeOf(nodes[e.step] ? nodes[e.step].blockId : "");
    const r = pick(wf, type, e.step);
    if (r.error) return say(r.error);
    if (r.ask) {
      session.wfPending = {
        kind: "pick",
        field: "step",
        cands: r.cands,
        edit: e,
      };
      return say(r.ask);
    }
    removeSubtree(wf, r.id);
    return done(wf, session, true);
  }

  if (e.intent === "set_template") {
    const type =
      e.channel || typeOf(nodes[e.step] ? nodes[e.step].blockId : "");
    const r = pick(wf, type, e.step);
    if (r.error) return say(r.error);
    if (r.ask) {
      session.wfPending = {
        kind: "pick",
        field: "step",
        cands: r.cands,
        edit: e,
      };
      return say(r.ask);
    }
    if (!e.template) {
      session.wfPending = { kind: "template", blockId: r.id };
      return say("Which template should I use?");
    }
    setTemplate(wf, r.id, e.template);
    return done(wf, session, false);
  }

  // change / remove the clock time of an existing step
  if (e.intent === "set_schedule") {
    const type =
      e.channel || typeOf(nodes[e.step] ? nodes[e.step].blockId : "");
    if (!type || type === "segment")
      return say("Which step should I schedule? Tell me the step number (#).");
    const r = pick(wf, type, e.step);
    if (r.error) return say(r.error);
    if (r.ask) {
      session.wfPending = {
        kind: "pick",
        field: "step",
        cands: r.cands,
        edit: e,
      };
      return say(r.ask);
    }
    const schedule = scheduleOf(session, e);
    if (schedule === undefined)
      return say(
        'I could not read that time. Please say it like "at 5:30 pm" or "at 17:30".',
      );
    setSchedule(wf, r.id, schedule); // null = send now (schedule removed)
    return done(wf, session, true);
  }

  // change the wait / slot / day of an existing Date and Time step
  if (e.intent === "set_timing") {
    const r = pick(wf, "dateandtime", e.step);
    if (r.error) return say(r.error);
    if (r.ask) {
      session.wfPending = {
        kind: "pick",
        field: "step",
        cands: r.cands,
        edit: e,
      };
      return say(r.ask);
    }
    if (!setTiming(wf, r.id, e, session))
      return say(
        'I could not use that timing. Try "wait 2 hours", "between 10 am and 12 pm", "on Mondays", or "between 5 Oct 10:00 and 7 Oct 18:00".',
      );
    return done(wf, session, true);
  }
  return null;
}

function stepNo(t, cands) {
  const m = t.match(/\d+/);
  if (m && cands.includes(Number(m[0]))) return Number(m[0]);
  const w = t.toLowerCase();
  if (/\b(first|1st)\b/.test(w)) return cands[0];
  if (/\b(second|2nd)\b/.test(w)) return cands[1];
  if (/\b(third|3rd)\b/.test(w)) return cands[2];
  if (/\b(last|latest)\b/.test(w)) return cands[cands.length - 1];
  return undefined;
}

async function classify(llmModel, wf, text, session) {
  const steps = wf.steps
    .map(
      (s, i) =>
        `#${i + 1} | ${typeOf(wf.flowchartConfig.nodes[i + 1].blockId)} | ${s.name}`,
    )
    .join("\n");
  const res = await llmModel.invoke([
    {
      role: "system",
      content:
        INTENT_PROMPT +
        "\n" +
        dateContext(session) +
        "\nCURRENT STEPS (number | channel | name):\n" +
        steps,
    },
    { role: "user", content: text },
  ]);
  const raw =
    typeof res.content === "string"
      ? res.content
      : (res.content && res.content[0] && res.content[0].text) || "";
  try {
    return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
}
/* ---------- entry point ----------
   returns { message, wf? }                                   -> use it as the reply
   returns { save: true, wf, actiontype, pid, draft }         -> call saveWorkflow(...) with those values
   returns null                                               -> let the normal LLM agent handle the turn (questions, new workflow) */
export async function handleWorkflowEdit({ llmModel, session, wf, text }) {
  wf = heal(clone(wf));
  session.wfSkipped = session.wfSkipped || [];
  const mode = modeOf(session);
  const t = String(text || "").trim();
  const p = session.wfPending;
  session.wfPending = null;

  // "save as draft": save right away, even with missing templates or settings (status = false)
  if (DRAFT.test(t)) return saveResult(wf, session, t);

  if (p && p.kind === "pick") {
    const n = stepNo(t, p.cands);
    if (n) return apply(wf, session, { ...p.edit, [p.field]: n });
  } else if (p && p.kind === "group" && !COMMAND.test(t)) {
    return apply(wf, session, {
      ...p.edit,
      group: t.replace(/^["']|["']$/g, ""),
    });
  } else if (p && p.kind === "event") {
    const hit = EVENTS[p.pt].find(
      (x) => x[0].toLowerCase() === t.toLowerCase() || x[1] === t.toLowerCase(),
    );
    if (hit) return apply(wf, session, { ...p.edit, event: hit[1] });
  } else if (p && p.kind === "dup" && /\b(add|another|yes|again)\b/i.test(t)) {
    return apply(wf, session, { ...p.edit, force: true });
  } else if (
    p &&
    p.kind === "template" &&
    (SKIP_START.test(t) ||
      (!isSaveWord(t, mode) && !COMMAND.test(t) && t.split(/\s+/).length <= 4))
  ) {
    if (SKIP_START.test(t)) {
      wf.flowchartConfig.nodes.forEach((n, i) => {
        const ty = typeOf(n.blockId),
          c = cfgOf(wf, n.blockId);
        if (
          i > 0 &&
          isChannel(ty) &&
          c &&
          (!c.Value || c.Value === ty + "_template") &&
          !session.wfSkipped.includes(n.blockId)
        )
          session.wfSkipped.push(n.blockId);
      });
      session.wfPending = null;
      return isSaveWord(t, mode)
        ? saveResult(wf, session, t)
        : say(saveQuestion(wf, session));
    }
    setTemplate(wf, p.blockId, t.replace(/^["']|["']$/g, ""));
    return done(wf, session, false);
  }

  if (isSaveWord(t, mode)) {
    // yes / save / update / new version
    const q = nextQuestion(wf, session);
    return session.wfPending ? say(q) : saveResult(wf, session, t); // a template is still missing: ask first
  }
  const e = await classify(llmModel, wf, t, session);
  if (
    !e ||
    !["add", "remove", "set_template", "set_schedule", "set_timing"].includes(
      e.intent,
    )
  )
    return null;
  if (TYPE_ALIAS[String(e.channel || "").toLowerCase()])
    e.channel = "addtogroup";
  // the small model invents step numbers: trust one only if the user really wrote it ("step 3", "#3", "second mail")
  if (
    !/(?:\bstep\s*#?\s*\d+|#\s*\d+|\b(?:first|second|third|1st|2nd|3rd|last)\b)/i.test(
      t,
    )
  ) {
    e.parentStep = null;
    e.step = null;
    e.beforeStep = null;
  }

  // timing words: fill whatever the small model left empty
  if (["add", "set_schedule", "set_timing"].includes(e.intent)) {
    const found = timingFromText(t);
    Object.keys(found).forEach((k) => {
      if (e[k] === undefined || e[k] === null) e[k] = found[k];
    });
    if (!e.timing && e.waitN && e.waitUnit) e.timing = "wait";
    if (e.intent === "set_timing" && !e.channel) e.channel = "dateandtime";
  }

  e.between =
    /\b(in\s*between|before|between\s+(?:the\s+)?(?:audience|mail|sms|whatsapp|rcs|web\s*push|step|#))/i.test(
      t,
    );
  return apply(wf, session, e);
}

/* ---------- save: the app calls the MCP tool itself (no LLM tool call) ----------
   C# tool: SaveAgentWorkFlow(ExecutionJson, flowchartConfig, configarray, name, agenthistory, status, pid, actiontype, tasktrigger)
   actiontype: "save" (create) | "reuse" | "edit" (update, needs pid) | "newversion" (needs pid)
   status: true only when every step is fully configured AND the user did not ask for a draft; otherwise false (saved as a draft, will not start) */
const txt = (c) =>
  typeof c === "string"
    ? c
    : Array.isArray(c)
      ? c.map((b) => (typeof b === "string" ? b : (b && b.text) || "")).join("")
      : String(c || "");

export async function saveWorkflow({
  tools,
  wf,
  history,
  pid,
  actiontype,
  draft,
}) {
  const tool = (tools || []).find(
    (x) =>
      String(x.name).toLowerCase().replace(/_/g, "") === "saveagentworkflow",
  );
  if (!tool)
    return "Saving failed: the save tool was not found. Please try again later.";
  const act = ["edit", "reuse", "newversion"].includes(
    String(actiontype || "").toLowerCase(),
  )
    ? String(actiontype).toLowerCase()
    : "save";

  const missing = findIncomplete(wf);
  const status = missing.length === 0 && !draft; // false = draft

  const args = {
    ExecutionJson: JSON.stringify(wf.steps ?? []), // never undefined
    flowchartConfig: JSON.stringify(wf.flowchartConfig ?? {}), // never undefined
    configarray: JSON.stringify(wf.configarray ?? []), // never undefined
    name: wf.name || "Workflow",
    agenthistory: (history || [])
      .filter((m) => m.role === "user")
      .map((m) => txt(m.content))
      .join("\n"),
    status,
    pid: Number(pid) || 0,
    actiontype: act,
    tasktrigger: false,
  };

  try {
    const raw = await tool.invoke(args);
    console.log(
      "[saveWorkflow] raw result:",
      typeof raw === "string" ? raw : JSON.stringify(raw),
    ); // debug

    let ok = true,
      msg = "";
    try {
      const r = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (typeof r === "number") {
        ok = r > 0; // old C#: returns the Id
      } else {
        ok =
          r?.Status !== false &&
          r?.success !== false &&
          !r?.error &&
          (r?.Id === undefined || r.Id > 0);
        msg = [r?.Message || r?.message || r?.error, r?.Inner]
          .filter(Boolean)
          .join(" | ");
      }
    } catch {
      msg = txt(raw).slice(0, 200);
      ok = !/error|fail|exception/i.test(msg);
    }
    if (!ok)
      return `Saving failed${msg ? ": " + msg : ""}. Reply "yes" to try again.`;

    const asDraft = status ? "" : " as a draft";
    const base =
      act === "edit"
        ? `Workflow '${wf.name}' is updated${asDraft}`
        : act === "newversion"
          ? `Workflow '${wf.name}' is saved as a new version${status ? "" : " (draft)"}`
          : `Workflow '${wf.name}' is saved${asDraft}`;

    if (status) return base + ".";

    // complete workflow, saved as a draft only because the user asked for it
    if (missing.length === 0)
      return `${base}. It will not start until you activate it.`;

    // incomplete workflow
    return (
      `${base}, so it will not start yet. Still missing:\n${missingLines(missing)}\n` +
      `Click "Preview workflow", set these configurations, then confirm again to activate it.`
    );
  } catch (err) {
    console.error("[saveWorkflow] error:", err); // full error in the log
    return `Saving failed: ${String(err.message || err).slice(0, 200)}. Reply "yes" to try again.`;
  }
}
