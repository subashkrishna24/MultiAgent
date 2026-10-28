// workflow.edit.js
// The LLM only CLASSIFIES the user's sentence (small JSON). This file edits the workflow JSON,
// asks "which mail?", asks for missing templates, checks the configuration, and builds the reply.
//
// SESSION FIELDS (set by the controller):
//   session.wfMode = "create" | "edit" | "reuse"   (default "create")
//   session.wfPid  = id of the workflow opened with "Edit" (only used in edit mode)

const EVENTS = {
  mail: [["Deliver", "delivered"], ["Open", "opened"], ["Not Open", "notopened"], ["Click", "clicked"], ["Not Click", "notclicked"], ["Bounce", "bounced"]],
  sms: [["Send", "sent"], ["Deliver", "delivered"], ["Click", "clicked"], ["Not Click", "notclicked"], ["Bounce", "bounced"]],
  whatsapp: [["Deliver", "delivered"], ["Read", "read"], ["Not Read", "notread"], ["Clicked", "clicked"], ["Not Clicked", "notclicked"], ["Failed", "failed"]],
  rcs: [["Deliver", "delivered"], ["Read", "read"], ["Not Read", "notread"], ["Clicked", "clicked"], ["Not Clicked", "notclicked"], ["Unreachable", "unreachable"]],
  webpush: [["Push", "pushed"], ["View", "viewed"], ["Click", "clicked"], ["Not Click", "notclicked"], ["Dismiss", "dismissed"], ["Bounce", "bounced"]],
};
const NAME = { mail: "Mail", sms: "SMS", whatsapp: "WhatsApp", rcs: "RCS", webpush: "Web Push" };
const GROUPS = { movetogroup: "Move to Group", addtogroup: "Add to Group", removefromgroup: "Remove from Group" };

const typeOf = (id) => String(id).replace("state_", "").split("_")[0];
const isChannel = (t) => !!EVENTS[t];
const nm = (t) => NAME[t] || GROUPS[t] || t;
const labelOf = (t) => GROUPS[t] || "Send " + NAME[t];
const say = (message) => ({ message });
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- save / update / new version wording ---------- */
const SAVE = /^\s*(?:skip(?: all)?(?: and| then)?\s+)?(?:yes|y|yeah|ok|okay|save|update|confirm|go ahead|proceed)(?:\s+(?:it|this|the|my|now))*(?:\s+(?:workflow|flow|agent))?\s*[.!]*\s*$/i;
const UPDATE = /^\s*(?:yes[,\s]*)?(?:please\s+)?(?:update|overwrite|replace)(?:\s+(?:it|this|the|my|existing|workflow|flow|agent|now))*\s*[.!]*\s*$/i;
const NEWVER = /\b(?:new\s*version|newversion|create\s+(?:a\s+)?new|save\s+as\s+(?:a\s+)?new|as\s+(?:a\s+)?new|new\s+(?:one|copy))\b/i;
const SKIP_START = /^\s*skip\b/i;
const COMMAND = /\b(add|remove|delete|send|also|then|change|replace|preview|save|those|who|if|when|after)\b/i;

const stripSkip = (t) => t.replace(/^\s*skip(?: all)?(?: and| then)?\s+/i, "");
const modeOf = (session) => (session && session.wfMode) || "create";
const isSaveWord = (t, mode) => SAVE.test(t) || (mode === "edit" && (UPDATE.test(stripSkip(t)) || NEWVER.test(t)));

const INTENT_PROMPT = `You read ONE user message about an existing messaging workflow and output ONE minified JSON object. No prose, no code fences.
Shape:
{"intent":"add|remove|set_template|question|new|other","channel":"mail|sms|whatsapp|rcs|webpush|movetogroup|addtogroup|removefromgroup|null","parentChannel":"mail|sms|whatsapp|rcs|webpush|null","parentStep":null,"event":null,"sequence":false,"step":null,"template":null,"group":null}
Rules:
- add: the user wants a new action ("also send...", "add...", "then..."). channel = the NEW action.
- parentChannel = channel of the message whose event triggers the new action ("those who open the mail" -> mail). null when the new action does not depend on any message.
- parentStep = a number only when the user said one ("step 3", "second mail" = the step number of the 2nd mail in the list below). Otherwise null.
- event (one of delivered, sent, opened, notopened, clicked, notclicked, bounced, read, notread, failed, unreachable, pushed, viewed, dismissed): received/delivered -> delivered; sent/has been sent -> sent; open/opens/opened -> opened; did not open -> notopened; click -> clicked; did not click -> notclicked; bounce -> bounced; read/seen -> read; unread -> notread. Otherwise null.
- sequence = true when the user only says "then"/"after that" with no event and no parent channel.
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
function pick(wf, type, num) {
  const c = listOf(wf, type);
  if (!c.length) return { error: `There is no ${nm(type)} step in '${wf.name}'. Add one first, or tell me which step you mean.` };
  if (num) {
    const hit = c.find((x) => x.num === Number(num));
    return hit ? { id: hit.blockId } : { error: `Step ${num} is not a ${nm(type)} step.` };
  }
  if (c.length === 1) return { id: c[0].blockId };
  return {
    cands: c.map((x) => x.num),
    ask: `Which ${nm(type)} do you mean? ` + c.map((x) => `Step ${x.num} (${x.step ? x.step.name : nm(type)})`).join(" or ") + ". Reply with the step number.",
  };
}
function resolveEvent(pt, key) {
  const list = EVENTS[pt];
  const i = key ? list.findIndex((e) => e[1] === key) : list.findIndex((e) => e[1] === "delivered" || e[1] === "pushed");
  if (i < 0) return { error: `${NAME[pt]} has no "${key}" event. Its events are: ${list.map((e) => e[0]).join(", ")}. Which one do you mean?` };
  return { idx: i, label: list[i][0], key: list[i][1] };
}

/* ---------- configuration check (mirrors the validation of the preview popups) ---------- */
const lowerKeys = (o) => {
  const r = {};
  Object.keys(o || {}).forEach((k) => (r[k.toLowerCase()] = o[k]));
  return r;
};
const blank = (v) => v === undefined || v === null || v === "" || v === 0 || v === "0";
// which channels need a configuration name / the mail fields
const CHAN_NEEDS = {
  mail: { cfg: true, mail: true },
  sms: { cfg: true },
  whatsapp: { cfg: true },
  rcs: { cfg: true },
  webpush: {},
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
      if (blank(a.templateid)) m.push("template");
      if (need.cfg && blank(a.configurationnameid)) m.push("configuration name");
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
    } else if (t === "dateandtime") {
      if (a.datecondition === undefined || a.datecondition === null) m.push("date and time");
    }

    if (m.length) out.push({ step: i + 1, name: s.name || labelOf(t), missing: m });
  });
  return out;
}

const missingLines = (list) =>
  list.map((x) => (x.step === 0 ? `- Audience: ${x.missing.join(", ")}` : `- Step ${x.step} (${x.name}): ${x.missing.join(", ")}`)).join("\n");

// text placed in front of the final question while something is missing
export function incompleteNote(wf) {
  const list = findIncomplete(wf);
  if (!list.length) return "";
  return (
    `Some settings are still missing:\n${missingLines(list)}\n` +
    `If you continue now, the workflow is saved with status OFF and will not start. ` +
    `Click "Preview workflow" and set these configurations to activate it.`
  );
}

/* ---------- edits ---------- */
function addNode(wf, e, parentId, ev) {
  const f = wf.flowchartConfig, nodes = f.nodes, type = e.channel, group = !!GROUPS[type];
  const root = nodes[0].blockId, isRoot = parentId === root;
  const maxTs = Math.max(...nodes.map((n) => Number(String(n.blockId).split("_").pop()) || 0));
  const id = `state_${type}_${maxTs + 1000}`;
  const parent = nodes.find((n) => n.blockId === parentId);
  const kids = f.connections.filter((c) => c.SourceId === parentId).map((c) => nodes.find((n) => n.blockId === c.TargetId)).filter(Boolean);
  const y = parent.positionY + 130;
  let x = kids.length ? Math.max(...kids.map((k) => k.positionX)) + 340 : parent.positionX;
  while (nodes.some((n) => n.positionX === x && n.positionY === y)) x += 340;

  nodes.push({ blockId: id, positionX: x, positionY: y, label: labelOf(type) });
  f.connections.push({ connectionId: "", SourceId: parentId, TargetId: id, anchor: isRoot ? "Bottom3" : "Bottom" + (ev.idx + 1), RelationWithParent: isRoot ? "Satisfy" : ev.label });

  const val = group ? e.group : e.template || type + "_template";
  wf.configarray.push({ Channel: id, Value: val, Title: val });

  wf.steps.push(makeStep(wf, type, parentId, ev, val));
}

// one step object for a node (used when adding AND when healing a broken workflow)
function makeStep(wf, type, parentId, ev, val) {
  const root = wf.flowchartConfig.nodes[0].blockId, isRoot = parentId === root, group = !!GROUPS[type];
  const pStep = isRoot ? null : stepOfNode(wf, parentId);
  const query = (cfgOf(wf, root) || {}).Value || "";
  const args = group ? { actiontype: type } : { channel: type };
  if (isRoot) args.getquery = query;
  else { args.getreposechannel = typeOf(parentId); args.eventName = ev.key; }
  if (group) args.groupname = val;
  Object.assign(args, { type: 0, isworkflow: true, agentworkflowid: "{{agentworkflowid}}", agenttaskid: "" });
  if (!group) args.templatename = val;
  args.taskrepeatedvalues = !!(pStep && pStep.action.args.taskrepeatedvalues === true);
  return {
    id: "", order: 0, type: "action", dependsOn: "",
    name: isRoot ? `${labelOf(type)}${group ? " " + val : ""} to ${query}` : `${labelOf(type)}${group ? " " + val : ""} on ${NAME[typeOf(parentId)]} ${ev.label}`,
    action: { module: "reporting", args },
  };
}

// make nodes, steps and configarray line up (step N <-> node N); rebuild missing steps from the node + connection
function heal(wf) {
  const f = wf.flowchartConfig, nodes = f.nodes, old = wf.steps || [];
  wf.configarray = wf.configarray || [];
  nodes.forEach((n, i) => {
    if (i > 0 && !cfgOf(wf, n.blockId)) {
      const t = typeOf(n.blockId), v = GROUPS[t] ? "" : t + "_template";
      wf.configarray.push({ Channel: n.blockId, Value: v, Title: v });
    }
  });
  const byNo = {};
  old.forEach((s, k) => { byNo[parseInt(String(s.id || "").replace("step", ""), 10) || k + 1] = s; });
  const steps = [];
  for (let i = 1; i < nodes.length; i++) {
    const t = typeOf(nodes[i].blockId), s = byNo[i], a = s && s.action && s.action.args;
    if (a && (a.channel === t || a.actiontype === t || a.controltype === t)) { steps.push(s); continue; }
    let c = f.connections.find((x) => x.TargetId === nodes[i].blockId);
    if (!c) { c = { connectionId: "", SourceId: nodes[0].blockId, TargetId: nodes[i].blockId, anchor: "Bottom3", RelationWithParent: "Satisfy" }; f.connections.push(c); }
    const pid = c.SourceId;
    const row = c && pid !== nodes[0].blockId ? (EVENTS[typeOf(pid)] || []).findIndex((e) => e[0] === c.RelationWithParent) : -1;
    const ev = row >= 0 ? { idx: row, label: EVENTS[typeOf(pid)][row][0], key: EVENTS[typeOf(pid)][row][1] } : { idx: 0, label: "Deliver", key: "delivered" };
    steps.push(makeStep({ ...wf, steps }, t, pid, ev, cfgOf(wf, nodes[i].blockId).Value));
  }
  wf.steps = steps;
  return rebuild(wf);
}

function removeSubtree(wf, blockId) {
  const f = wf.flowchartConfig, drop = new Set([blockId]);
  for (let grew = true; grew;) {
    grew = false;
    f.connections.forEach((c) => { if (drop.has(c.SourceId) && !drop.has(c.TargetId)) { drop.add(c.TargetId); grew = true; } });
  }
  wf.steps = wf.steps.filter((s, k) => !drop.has(f.nodes[k + 1].blockId));
  f.nodes = f.nodes.filter((n) => !drop.has(n.blockId));
  f.connections = f.connections.filter((c) => !drop.has(c.SourceId) && !drop.has(c.TargetId));
  wf.configarray = wf.configarray.filter((c) => !drop.has(c.Channel));
}

function setTemplate(wf, id, name) {
  const c = cfgOf(wf, id);
  if (c) { c.Value = name; c.Title = name; }
  const s = stepOfNode(wf, id);
  if (s) { s.action.args.templatename = name; delete s.action.args.templateid; }
}

// recompute ids, order, dependsOn, agenttaskid from the tree
function rebuild(wf) {
  const f = wf.flowchartConfig, nodes = f.nodes, idx = {};
  nodes.forEach((n, i) => (idx[n.blockId] = i));
  f.connections.forEach((c, i) => (c.connectionId = "con_" + (i + 1)));
  f.numberOfElements = nodes.length;
  wf.steps.forEach((s, k) => {
    const i = k + 1, id = "step" + i;
    const c = f.connections.find((x) => x.TargetId === nodes[i].blockId);
    const root = !c || c.SourceId === nodes[0].blockId;
    s.id = id; s.order = i;
    s.dependsOn = root ? "step0" : "step" + idx[c.SourceId];
    s.action.args.agenttaskid = root ? id : s.dependsOn;
  });
  return wf;
}

/* ---------- reply building ---------- */
// create / reuse: "save". edit: "update or create a new version".
// When settings are missing, a note is placed in front of the question.
export const saveQuestion = (wf, session) => {
  const q =
    modeOf(session) === "edit"
      ? `Would you like to update '${wf.name}' or create a new version? Reply "update" or "new version", or tell me what to change.`
      : `Would you like me to save this workflow '${wf.name}'? Reply "yes" to save, or tell me what to change.`;
  const note = incompleteNote(wf);
  return note ? note + "\n" + q : q;
};

// LLM-written replies end with the plain save / update sentence: swap it for the app's version
// (mode wording + missing-settings note). Works for create, edit and reuse.
export function fixSaveQuestion(message, wf, session) {
  return String(message).replace(/(?:Would you like me to save this workflow|Would you like to update ).*$/m, () => saveQuestion(wf, session));
}

function summary(wf) {
  const lines = wf.steps.map((s, i) => {
    const node = wf.flowchartConfig.nodes[i + 1], t = typeOf(node.blockId), c = cfgOf(wf, node.blockId);
    const v = !c ? "" : isChannel(t) && (!c.Value || c.Value === t + "_template") ? "template not set yet" : c.Value;
    return `${i + 1}. ${s.name} (${v})`;
  });
  return `Summary of '${wf.name}':\n` + lines.join("\n");
}

function nextQuestion(wf, session) {
  const skipped = session.wfSkipped || [], nodes = wf.flowchartConfig.nodes;
  for (let i = 1; i < nodes.length; i++) {
    const t = typeOf(nodes[i].blockId), c = cfgOf(wf, nodes[i].blockId);
    if (isChannel(t) && c && (!c.Value || c.Value === t + "_template") && !skipped.includes(nodes[i].blockId)) {
      session.wfPending = { kind: "template", blockId: nodes[i].blockId };
      return `Step ${i} (${(wf.steps[i - 1] || {}).name || labelOf(t)}) has no template yet in '${wf.name}'. Which template should I use? (Reply "skip" to keep the placeholder.)`;
    }
  }
  session.wfPending = null;
  return saveQuestion(wf, session);
}

function done(wf, session, withSummary) {
  rebuild(wf);
  const q = nextQuestion(wf, session);
  return { wf, message: JSON.stringify(wf) + "\n" + (withSummary ? summary(wf) + "\n" : "") + q };
}

// what to send to SaveAgentWorkFlow, based on the mode and what the user answered
function saveResult(wf, session, t) {
  const mode = modeOf(session), s = stripSkip(t);
  if (mode === "edit") {
    const pid = Number(session.wfPid) || 0;
    if (NEWVER.test(s)) return { save: true, wf, actiontype: "newversion", pid };
    if (UPDATE.test(s)) return { save: true, wf, actiontype: pid ? "edit" : "save", pid };
    // a bare "yes" / "save" is ambiguous when editing
    return say(`Do you want to update '${wf.name}' or create a new version? Reply "update" or "new version".`);
  }
  return {
    save: true, wf,
    actiontype: mode === "reuse" ? "reuse" : "save",
    pid: 0, // pid: only edit / newversion send the id
  };
}

// call after the LLM created a workflow, so a template answer is understood next turn
export function primePending(wf, session) {
  session.wfSkipped = [];
  nextQuestion(wf, session);
}

export function validateWorkflow(wf) {
  const f = wf && wf.flowchartConfig;
  if (!f || !Array.isArray(f.nodes) || !Array.isArray(f.connections) || !Array.isArray(wf.steps) || !Array.isArray(wf.configarray)) return false;
  const n = f.nodes.length, ids = new Set(f.nodes.map((x) => x.blockId));
  return n > 1 && f.connections.length === n - 1 && wf.steps.length === n - 1 && wf.configarray.length === n &&
    f.connections.every((c) => ids.has(c.SourceId) && ids.has(c.TargetId)) &&
    wf.steps.every((s) => s.action && s.action.args);
}

/* ---------- apply one classified edit ---------- */
function apply(wf, session, e) {
  const nodes = wf.flowchartConfig.nodes, root = nodes[0].blockId;

  if (e.intent === "add") {
    const type = e.channel;
    if (!isChannel(type) && !GROUPS[type]) return say("I can add Send Mail, SMS, WhatsApp, RCS, Web Push, or Move / Add / Remove group steps. Which one do you want?");
    if (GROUPS[type] && !e.group) {
      session.wfPending = { kind: "group", edit: e };
      return say(`Which group should the contacts be ${type === "removefromgroup" ? "removed from" : type === "addtogroup" ? "added to" : "moved to"}?`);
    }
    let parent = root, ev = null, pt = e.parentChannel;
    if (!pt && e.sequence) {
      const last = [...nodes].reverse().find((n) => isChannel(typeOf(n.blockId)));
      if (last) { pt = typeOf(last.blockId); e.parentStep = e.parentStep || nodes.indexOf(last); }
    }
    if (pt) {
      if (!isChannel(pt)) return say("A group step cannot have a next step. Which message should this follow?");
      const r = pick(wf, pt, e.parentStep);
      if (r.error) return say(r.error);
      if (r.ask) { session.wfPending = { kind: "pick", field: "parentStep", cands: r.cands, edit: e }; return say(r.ask); }
      parent = r.id;
      ev = resolveEvent(pt, e.event);
      if (ev.error) { session.wfPending = { kind: "event", pt, edit: e }; return say(ev.error); }
    }
    if (ev && !e.force) {
      const hit = wf.flowchartConfig.connections.find((c) => c.SourceId === parent && c.anchor === "Bottom" + (ev.idx + 1) && typeOf(c.TargetId) === type);
      if (hit) {
        const num = nodes.findIndex((n) => n.blockId === hit.TargetId);
        session.wfPending = { kind: "dup", edit: e };
        return say(`Step ${num} (${(wf.steps[num - 1] || {}).name}) already does this. Reply "add another" to add a second one, or tell me what to change.`);
      }
    }
    addNode(wf, e, parent, ev);
    return done(wf, session, true);
  }

  if (e.intent === "remove") {
    if (!e.channel && !e.step) return say("Which step should I remove? Tell me the step number.");
    const type = e.channel || typeOf(nodes[e.step] ? nodes[e.step].blockId : "");
    const r = pick(wf, type, e.step);
    if (r.error) return say(r.error);
    if (r.ask) { session.wfPending = { kind: "pick", field: "step", cands: r.cands, edit: e }; return say(r.ask); }
    removeSubtree(wf, r.id);
    return done(wf, session, true);
  }

  if (e.intent === "set_template") {
    const type = e.channel || typeOf(nodes[e.step] ? nodes[e.step].blockId : "");
    const r = pick(wf, type, e.step);
    if (r.error) return say(r.error);
    if (r.ask) { session.wfPending = { kind: "pick", field: "step", cands: r.cands, edit: e }; return say(r.ask); }
    if (!e.template) { session.wfPending = { kind: "template", blockId: r.id }; return say("Which template should I use?"); }
    setTemplate(wf, r.id, e.template);
    return done(wf, session, false);
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

async function classify(llmModel, wf, text) {
  const steps = wf.steps.map((s, i) => `${i + 1} | ${typeOf(wf.flowchartConfig.nodes[i + 1].blockId)} | ${s.name}`).join("\n");
  const res = await llmModel.invoke([
    { role: "system", content: INTENT_PROMPT + "\nCURRENT STEPS (number | channel | name):\n" + steps },
    { role: "user", content: text },
  ]);
  const raw = typeof res.content === "string" ? res.content : (res.content && res.content[0] && res.content[0].text) || "";
  try { return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { return null; }
}

/* ---------- entry point ----------
   returns { message, wf? }                          -> use it as the reply
   returns { save: true, wf, actiontype, pid }       -> call saveWorkflow(...) with those values
   returns null                                      -> let the normal LLM agent handle the turn (questions, new workflow) */
export async function handleWorkflowEdit({ llmModel, session, wf, text }) {
  wf = heal(clone(wf));
  session.wfSkipped = session.wfSkipped || [];
  const mode = modeOf(session);
  const t = String(text || "").trim();
  const p = session.wfPending;
  session.wfPending = null;

  if (p && p.kind === "pick") {
    const n = stepNo(t, p.cands);
    if (n) return apply(wf, session, { ...p.edit, [p.field]: n });
  } else if (p && p.kind === "group" && !COMMAND.test(t)) {
    return apply(wf, session, { ...p.edit, group: t.replace(/^["']|["']$/g, "") });
  } else if (p && p.kind === "event") {
    const hit = EVENTS[p.pt].find((x) => x[0].toLowerCase() === t.toLowerCase() || x[1] === t.toLowerCase());
    if (hit) return apply(wf, session, { ...p.edit, event: hit[1] });
  } else if (p && p.kind === "dup" && /\b(add|another|yes|again)\b/i.test(t)) {
    return apply(wf, session, { ...p.edit, force: true });
  } else if (p && p.kind === "template" && (SKIP_START.test(t) || (!isSaveWord(t, mode) && !COMMAND.test(t) && t.split(/\s+/).length <= 4))) {
    if (SKIP_START.test(t)) {
      wf.flowchartConfig.nodes.forEach((n, i) => {
        const ty = typeOf(n.blockId), c = cfgOf(wf, n.blockId);
        if (i > 0 && isChannel(ty) && c && (!c.Value || c.Value === ty + "_template") && !session.wfSkipped.includes(n.blockId)) session.wfSkipped.push(n.blockId);
      });
      session.wfPending = null;
      return isSaveWord(t, mode) ? saveResult(wf, session, t) : say(saveQuestion(wf, session));
    }
    setTemplate(wf, p.blockId, t.replace(/^["']|["']$/g, ""));
    return done(wf, session, false);
  }

  if (isSaveWord(t, mode)) {                          // yes / save / update / new version
    const q = nextQuestion(wf, session);
    return session.wfPending ? say(q) : saveResult(wf, session, t);   // a template is still missing: ask first
  }
  const e = await classify(llmModel, wf, t);
  if (!e || !["add", "remove", "set_template"].includes(e.intent)) return null;
  // the small model invents step numbers: trust one only if the user really wrote it ("step 3", "second mail")
  if (!/\bstep\s*\d+|\b(first|second|third|1st|2nd|3rd|last)\b/i.test(t)) { e.parentStep = null; e.step = null; }
  return apply(wf, session, e);
}

/* ---------- save: the app calls the MCP tool itself (no LLM tool call) ----------
   C# tool: SaveAgentWorkFlow(ExecutionJson, flowchartConfig, configarray, name, agenthistory, status, pid, actiontype, tasktrigger)
   actiontype: "save" (create) | "reuse" | "edit" (update, needs pid) | "newversion" (needs pid)
   status: true only when every step is fully configured, otherwise false (saved, but it will not start) */
const txt = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => (typeof b === "string" ? b : (b && b.text) || "")).join("") : String(c || ""));

export async function saveWorkflow({ tools, wf, history, pid, actiontype }) {
  const tool = (tools || []).find((x) => String(x.name).toLowerCase().replace(/_/g, "") === "saveagentworkflow");
  if (!tool) return "Saving failed: the save tool was not found. Please try again later.";
  const act = ["edit", "reuse", "newversion"].includes(String(actiontype || "").toLowerCase()) ? String(actiontype).toLowerCase() : "save";

  const missing = findIncomplete(wf);
  const status = missing.length === 0;

  const args = {
    ExecutionJson: JSON.stringify(wf.steps),
    flowchartConfig: JSON.stringify(wf.flowchartConfig),
    configarray: JSON.stringify(wf.configarray),
    name: wf.name || "Workflow",
    agenthistory: (history || []).filter((m) => m.role === "user").map((m) => txt(m.content)).join("\n"),
    status,
    pid: Number(pid) || 0,
    actiontype: act,
    tasktrigger: false,
  };
  try {
    const raw = await tool.invoke(args);
    let ok = true, msg = "";
    try { const r = typeof raw === "string" ? JSON.parse(raw) : raw; ok = r.success !== false && !r.error; msg = r.Message || r.message || r.error || ""; }
    catch { msg = txt(raw).slice(0, 200); ok = !/error|fail|exception/i.test(msg); }
    if (!ok) return `Saving failed${msg ? ": " + msg : ""}. Reply "yes" to try again.`;

    const base =
      act === "edit" ? `Workflow '${wf.name}' is updated`
        : act === "newversion" ? `Workflow '${wf.name}' is saved as a new version`
          : `Workflow '${wf.name}' is saved`;
    if (status) return base + ".";
    return (
      `${base}, but its status is OFF so it will not start yet. Still missing:\n${missingLines(missing)}\n` +
      `Click "Preview workflow", set these configurations, then confirm again to activate it.`
    );
  } catch (err) {
    return `Saving failed: ${String(err.message || err).slice(0, 200)}. Reply "yes" to try again.`;
  }
}