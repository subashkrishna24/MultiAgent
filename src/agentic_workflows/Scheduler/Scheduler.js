import "dotenv/config";
import { getMcpClient } from "../../services/mcp.service.js";
import {
  buildConditionInput,
  buildToolInput,
  buildWorkflow,
  getWorkflowId,
  nextStepIdsOf,
  isWorkflowActive,
  parseConditionReply,
  parseScheduleTime,
  parseToolReply,
  parseWorkflowList,
  validateStepArgs,
} from "./workflowSteps.js";
import { computeGate } from "./gates.js";
import { getStepState, updateStepState } from "./stateStore.js";

/*
 * HOW A WORKFLOW RUNS (full write-up: WORKFLOW_SCHEDULER_ARCHITECTURE.md)
 *
 * Two schedulers, never running at the same time (shared lock):
 *
 *   CONDITION scheduler (every 1 min)   ReleaseDueAgentWorkFlowConditions (DB: waiting -> released / expired)
 *                                       then trigger the next step(s) stored on each released condition,
 *                                       in that condition's own workflow (TaskData) - nothing else.
 *   WORKFLOW scheduler  (every 5 min)   the same release, then walk every step of every active workflow.
 *
 * Step kinds
 *   channel      Getcampaignresponsesandsentcontacts -> contacts saved, message sent
 *   addrules     Getcampaignresponsesandsentcontacts -> each contact saved as satisfy / notsatisfy
 *   dateandtime  SaveAgentWorkFlowCondition -> ONE row in the condition table, no contacts.
 *                The steps after it wait until the DB releases that row, then read their
 *                contacts from the date step's own source (query or parent event).
 *
 * Step status (data/scheduler-state.json)
 *   pending -> active -> done      channel / rule steps   (failed after N errors)
 *   waiting -> done                date steps: done = released (or expired) by the DB
 *
 *   one-shot      a root step, or a step right after a STATIC-group date step: runs once
 *   polling       everything else: runs every walk while its parent can still give contacts
 *   activeUntil   the last moment a step can still give contacts to its children
 */

/* ------------------------------------------------------------------ */
/* Config (all overridable from .env)                                  */
/* ------------------------------------------------------------------ */
const CFG = {
  accountId: Number(process.env.SCHEDULER_ACCOUNT_ID ?? 4),
  intervalMinutes: Number(process.env.SCHEDULER_INTERVAL_MINUTES ?? 5),
  conditionCheckMinutes: Number(
    process.env.SCHEDULER_CONDITION_CHECK_MINUTES ?? 1,
  ),
  maxRetries: Number(process.env.SCHEDULER_MAX_RETRIES ?? 3),
  childWindowMs:
    Number(process.env.SCHEDULER_CHILD_WINDOW_HOURS ?? 72) * 3_600_000,
  gateGraceMs: Number(process.env.SCHEDULER_GATE_GRACE_MINUTES ?? 60) * 60_000,
  repeatMs:
    Number(process.env.SCHEDULER_REPEAT_INTERVAL_MINUTES ?? 1440) * 60_000,
  timezone: process.env.SCHEDULER_TIMEZONE || "Asia/Kolkata",
  // "Proceed from the step" (datecondition 4) times without a zone: false = UTC, true = SCHEDULER_TIMEZONE
  dateRangeLocal:
    String(process.env.SCHEDULER_DATERANGE_LOCAL ?? "false").toLowerCase() ===
    "true",
};

const TOOL_WORKFLOWS = "GetAgentWorkFlowDetails";
const TOOL_CONTACTS = "Getcampaignresponsesandsentcontacts";
const TOOL_SAVE_CONDITION = "SaveAgentWorkFlowCondition";
const TOOL_RELEASE_CONDITIONS = "ReleaseDueAgentWorkFlowConditions";

const log = (...a) => console.log("[scheduler]", ...a);
const iso = (ms) => (ms ? new Date(ms).toISOString() : "-");

const truthy = (v) =>
  v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true";
const isRepeat = (step) => truthy(step.args.taskrepeatedvalues);
const isDynamic = (step) => truthy(step.args.isdynamicgroup);
const parentOf = (step, wf) =>
  step.dependsOn.length
    ? wf.steps.find((s) => s.id === step.dependsOn.at(-1))
    : null;

/* ------------------------------------------------------------------ */
/* Step readiness                                                      */
/* ------------------------------------------------------------------ */

/**
 * Decide what to do with a step right now. Nothing is written here.
 * @returns {{action:"run"|"wait"|"skip"|"expire"|"none", reason?:string, gate?:object}}
 */
export function evaluateStep(step, wf, now = Date.now()) {
  const st = getStepState(wf.workflowId, step.id);
  if (st?.status === "done" || st?.status === "failed")
    return { action: "none", reason: st.status };

  if (step.kind === "unknown" || step.kind === "group")
    return {
      action: "skip",
      reason: `step type "${step.kind}" is not supported by the scheduler yet`,
    };

  const v = validateStepArgs(step);
  if (!v.ok)
    return {
      action: "skip",
      reason: `${step.args.channel} step is not configured: missing ${v.missing.join(", ")}`,
    };

  // a date step whose condition is stored: the DB releases it, not this code
  if (step.kind === "dateandtime" && st?.status === "waiting") {
    if (now < (st.dueAt ?? 0))
      return {
        action: "wait",
        reason: `condition waiting until ${iso(st.dueAt)}`,
      };
    // past due but not released yet: re-save (idempotent) to read the DB status again
    return { action: "run", gate: { dueAt: st.dueAt, expireAt: st.expireAt } };
  }

  // ---- dependencies --------------------------------------------------------
  for (const dep of step.dependsOn) {
    const ds = getStepState(wf.workflowId, dep);
    if (ds?.status === "failed")
      return { action: "skip", reason: `parent ${dep} failed` };
    if (ds?.status === "waiting")
      return {
        action: "wait",
        reason: `${dep} condition waiting until ${iso(ds.dueAt)}`,
      };
    if (!ds?.completedAt)
      return { action: "wait", reason: `waiting for ${dep}` };
  }
  const parent = parentOf(step, wf);
  if (parent) {
    const ps = getStepState(wf.workflowId, parent.id);
    if (parent.kind === "dateandtime") {
      if (ps.expired)
        return {
          action: "expire",
          reason: `${parent.id} condition expired before it was released`,
        };
      if (ps.expireAt && now > ps.expireAt)
        return {
          action: "expire",
          reason: `${parent.id} condition window is over`,
        };
    }
    if (ps.status === "done" && now > (ps.activeUntil ?? 0))
      return {
        action: "expire",
        reason: `${parent.id} can no longer give contacts`,
      };
  }

  // ---- own timing ----------------------------------------------------------
  const due = parseScheduleTime(step.args.scheduletime);
  if (due && now < due)
    return {
      action: "wait",
      reason: `scheduled for ${step.args.scheduletime}`,
    };

  if (
    !parent &&
    isRepeat(step) &&
    st?.lastRunAt &&
    now - st.lastRunAt < CFG.repeatMs
  )
    return { action: "wait", reason: "repeat interval not reached" };

  // ---- date step: compute its release window now ---------------------------
  if (step.kind === "dateandtime") {
    const gate = computeGate(step.args, now, CFG.timezone, {
      rangeLocal: CFG.dateRangeLocal,
    });
    if (gate.error) return { action: "skip", reason: gate.error };
    return { action: "run", gate }; // gate.closed -> stored as expired
  }

  return { action: "run" };
}

/* ------------------------------------------------------------------ */
/* Date & time condition                                               */
/* ------------------------------------------------------------------ */

// After release: how long the steps after this date step may keep reading contacts.
function gateActiveUntil(step, releasedAt, expireAt) {
  if (isDynamic(step)) return expireAt ?? releasedAt + CFG.childWindowMs; // keep reading new contacts
  return releasedAt + CFG.gateGraceMs; // static: the next step runs once, grace covers its retries
}

/** Mirror one DB condition row into the step state. Returns true when it was released. */
function syncCondition(wf, step, row, now = Date.now()) {
  const prev = getStepState(wf.workflowId, step.id) ?? {};
  const common = {
    conditionId: row.id,
    dueAt: row.dueAt,
    expireAt: row.expireAt,
    failures: 0,
  };

  if (row.status === 0) {
    updateStepState(wf.workflowId, step.id, {
      ...common,
      status: "waiting",
      lastMessage: `waiting until ${iso(row.dueAt)}`,
    });
    return false;
  }
  if (row.status === 1) {
    const releasedAt = row.releasedAt ?? now;
    updateStepState(wf.workflowId, step.id, {
      ...common,
      status: "done",
      completedAt: prev.completedAt ?? releasedAt,
      releasedAt,
      activeUntil: gateActiveUntil(step, releasedAt, row.expireAt),
      lastMessage: `released at ${iso(releasedAt)}`,
    });
    log(`wf ${wf.workflowId} ${step.id} condition RELEASED`);
    return true;
  }
  updateStepState(wf.workflowId, step.id, {
    ...common,
    status: "done",
    expired: true,
    completedAt: prev.completedAt ?? now,
    activeUntil: now,
    lastMessage: "condition expired (window over)",
  });
  log(`wf ${wf.workflowId} ${step.id} condition EXPIRED`);
  return false;
}

async function executeCondition(step, wf, tools, gate) {
  const tool = tools.save;
  if (!tool)
    return { ok: false, message: `${TOOL_SAVE_CONDITION} tool missing` };
  const input = buildConditionInput(step, wf, gate);
  log(
    `wf ${wf.workflowId} ${step.id} "${step.name}" -> ${TOOL_SAVE_CONDITION}`,
    {
      dueat: input.dueatutc,
      expireat: input.expireatutc || "-",
      status: input.status,
      condition: input.conditionArgs,
    },
  );

  let reply;
  try {
    reply = parseConditionReply(await tool.invoke(input));
  } catch (err) {
    reply = { ok: false, message: err?.message ?? String(err), rows: [] };
  }
  if (!reply.ok || !reply.rows[0])
    return recordFailure(
      step,
      wf,
      reply.message || "no condition row returned",
    );

  syncCondition(wf, step, reply.rows[0]);
  return { ok: true, message: reply.message, total: 0, saved: 0 };
}

/* ------------------------------------------------------------------ */
/* Channel / rule step                                                 */
/* ------------------------------------------------------------------ */

// runs once: a root step (not repeating), or a step right after a STATIC-group date step
function finishesAfterRun(step, wf) {
  const parent = parentOf(step, wf);
  if (!parent) return !isRepeat(step);
  return parent.kind === "dateandtime" && !isDynamic(parent);
}

function nextActiveUntil(step, now) {
  if (step.kind === "addrules") return now + CFG.gateGraceMs; // outcome is immediate
  return now + CFG.childWindowMs; // channel: opens / clicks still to come
}

function recordFailure(step, wf, message) {
  const prev = getStepState(wf.workflowId, step.id) ?? {};
  const failures = (prev.failures ?? 0) + 1;
  updateStepState(wf.workflowId, step.id, {
    runs: (prev.runs ?? 0) + 1,
    lastRunAt: Date.now(),
    lastMessage: message,
    failures,
    status: failures >= CFG.maxRetries ? "failed" : (prev.status ?? "pending"),
  });
  log(
    `wf ${wf.workflowId} ${step.id} FAILED (${failures}/${CFG.maxRetries}): ${message}`,
  );
  return { ok: false, message };
}

async function executeStep(step, wf, tools) {
  const input = buildToolInput(step, wf);
  log(`wf ${wf.workflowId} ${step.id} "${step.name}" -> ${TOOL_CONTACTS}`, {
    channel: input.channel,
    stepid: input.stepid,
    source: input.getreposechannel
      ? `${input.agenttaskid} ${input.getreposechannel}:${input.eventName}`
      : input.getquery
        ? `query "${input.getquery}"`
        : "-",
    extraArgs: input.extraArgs,
  });

  let reply;
  try {
    reply = parseToolReply(await tools.contacts.invoke(input));
  } catch (err) {
    reply = { ok: false, message: err?.message ?? String(err) };
  }
  if (!reply.ok)
    return {
      ...recordFailure(step, wf, reply.message),
      needsAccount: reply.needsAccount,
    };

  const prev = getStepState(wf.workflowId, step.id) ?? {};
  const now = Date.now();
  updateStepState(wf.workflowId, step.id, {
    runs: (prev.runs ?? 0) + 1,
    lastRunAt: now,
    lastMessage: reply.message,
    failures: 0,
    completedAt: prev.completedAt ?? now,
    activeUntil: nextActiveUntil(step, now),
    total: reply.total,
    saved: (prev.saved ?? 0) + reply.saved,
    status: finishesAfterRun(step, wf) ? "done" : "active",
  });
  log(
    `wf ${wf.workflowId} ${step.id} OK total=${reply.total} saved=${reply.saved} skipped=${reply.skipped}`,
  );
  return reply;
}

/* ------------------------------------------------------------------ */
/* One workflow                                                        */
/* ------------------------------------------------------------------ */

function descendantsOf(wf, ids) {
  const out = new Set();
  let frontier = [...ids];
  while (frontier.length) {
    const next = [];
    for (const s of wf.steps)
      if (!out.has(s.id) && s.dependsOn.some((d) => frontier.includes(d))) {
        out.add(s.id);
        next.push(s.id);
      }
    frontier = next;
  }
  return out;
}

/**
 * Walk the steps of one workflow.
 * @param only  optional Set of step ids: run just these (the minute check passes the
 *              steps under a just-released condition, so nothing else is repeated)
 */
async function runWorkflow(wf, tools, only = null) {
  const summary = {
    workflowId: wf.workflowId,
    name: wf.name,
    executed: [],
    waiting: [],
    skipped: [],
  };
  if (!wf.workflowId) return { ...summary, error: "workflow row has no Id" };
  if (wf.steps.length === 0)
    return { ...summary, error: "TaskData has no steps" };

  const handled = new Set();
  let progressed = true;
  let failed = false;

  // a child may become ready right after its parent in the same walk
  while (progressed && !failed) {
    progressed = false;
    summary.waiting.length = 0;
    summary.skipped.length = 0;

    for (const step of wf.steps) {
      if (handled.has(step.id) || (only && !only.has(step.id))) continue;
      const now = Date.now();
      const d = evaluateStep(step, wf, now);

      if (d.action === "expire") {
        const prev = getStepState(wf.workflowId, step.id) ?? {};
        updateStepState(wf.workflowId, step.id, {
          status: "done",
          completedAt: prev.completedAt ?? now,
          activeUntil: prev.activeUntil ?? now,
          lastMessage: d.reason,
        });
        log(`wf ${wf.workflowId} ${step.id} done: ${d.reason}`);
        handled.add(step.id);
        progressed = true;
        continue;
      }
      if (d.action === "none") continue;
      if (d.action === "skip") {
        summary.skipped.push({ step: step.id, reason: d.reason });
        continue;
      }
      if (d.action === "wait") {
        summary.waiting.push({ step: step.id, reason: d.reason });
        continue;
      }

      handled.add(step.id);
      progressed = true;
      const r =
        step.kind === "dateandtime"
          ? await executeCondition(step, wf, tools, d.gate)
          : await executeStep(step, wf, tools);
      summary.executed.push({
        step: step.id,
        ok: r.ok,
        total: r.total,
        saved: r.saved,
        message: r.message,
      });

      if (r.needsAccount)
        return {
          ...summary,
          error: "account selection required (check MCP headers)",
        };
      if (!r.ok) {
        failed = true;
        break;
      } // retried next walk
    }
  }

  for (const w of summary.waiting)
    log(`wf ${wf.workflowId} ${w.step} waiting: ${w.reason}`);
  for (const s of summary.skipped)
    log(`wf ${wf.workflowId} ${s.step} skipped: ${s.reason}`);
  return summary;
}

/* ------------------------------------------------------------------ */
/* MCP plumbing                                                        */
/* ------------------------------------------------------------------ */

const clients = new Map();
async function getTools(accountId) {
  let client = clients.get(accountId);
  if (!client) {
    client = getMcpClient(
      accountId,
      process.env.MCP_API_KEY ?? "056d9b3cb5e4b39b5e4512b5eb331b5e6371c81031b8",
    );
    clients.set(accountId, client);
  }
  const all = await client.getTools();
  const find = (name) =>
    all.find((t) => t.name.toLowerCase() === name.toLowerCase());
  return {
    workflows: find(TOOL_WORKFLOWS),
    contacts: find(TOOL_CONTACTS),
    save: find(TOOL_SAVE_CONDITION),
    release: find(TOOL_RELEASE_CONDITIONS),
  };
}

// Which workflows may run (.env):
//   SCHEDULER_ONLY_WORKFLOW_IDS=24,25      only these ids run (empty = no id filter)
//   SCHEDULER_REQUIRE_TASKTRIGGER=true     only rows whose tasktrigger is checked run
const ONLY_IDS = String(process.env.SCHEDULER_ONLY_WORKFLOW_IDS ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);
const REQUIRE_TRIGGER = truthy(
  process.env.SCHEDULER_REQUIRE_TASKTRIGGER ?? "false",
);
const triggerOn = (r) =>
  truthy(r.TaskTrigger ?? r.taskTrigger ?? r.tasktrigger);
let lastPicked = "";

async function loadWorkflows(tools) {
  const rows = parseWorkflowList(await tools.workflows.invoke({ Id: 0 }));
  const picked = rows.filter(
    (r) =>
      getWorkflowId(r) &&
      isWorkflowActive(r) &&
      (ONLY_IDS.length === 0 || ONLY_IDS.includes(getWorkflowId(r))) &&
      (!REQUIRE_TRIGGER || triggerOn(r)),
  );
  const ids = picked.map(getWorkflowId).join(",");
  if (ids !== lastPicked) {
    // log only when the set changes
    log(
      `workflows that will run: ${ids || "(none)"} of ${rows.length}` +
        (ONLY_IDS.length
          ? ` [SCHEDULER_ONLY_WORKFLOW_IDS=${ONLY_IDS.join(",")}]`
          : "") +
        (REQUIRE_TRIGGER ? " [tasktrigger required]" : ""),
    );
    lastPicked = ids;
  }
  return picked.map(buildWorkflow);
}

/**
 * DB: every waiting condition whose time has come -> released (or expired).
 * @returns Map workflowId -> Set of step ids to trigger now (the next steps stored on each
 *          released condition; for a row saved before nextstepids existed, read from TaskData)
 */
async function releaseDueConditions(tools, workflows) {
  const trigger = new Map();
  if (!tools.release) return trigger;
  let reply;
  try {
    reply = parseConditionReply(await tools.release.invoke({}));
  } catch (err) {
    log(`${TOOL_RELEASE_CONDITIONS} failed:`, err.message);
    return trigger;
  }
  if (!reply.ok) {
    log(`${TOOL_RELEASE_CONDITIONS} failed: ${reply.message}`);
    return trigger;
  }

  for (const row of reply.rows) {
    const wf = workflows.find((w) => w.workflowId === row.workflowId);
    const step = wf?.steps.find((s) => s.id === row.stepId);
    if (!step) {
      log(
        `condition ${row.workflowId}/${row.stepId} released but the workflow is off or the step was removed`,
      );
      continue;
    }
    if (!syncCondition(wf, step, row)) continue; // expired: nothing to trigger

    const next = (
      row.nextStepIds.length ? row.nextStepIds : nextStepIdsOf(step, wf)
    ).filter((id) => wf.steps.some((s) => s.id === id));
    log(
      `wf ${wf.workflowId} ${step.id} -> trigger next: ${next.join(", ") || "(none)"}`,
    );
    if (!trigger.has(wf.workflowId)) trigger.set(wf.workflowId, new Set());
    for (const id of next) trigger.get(wf.workflowId).add(id);
  }
  return trigger;
}

/* ------------------------------------------------------------------ */
/* Public: one run                                                     */
/* ------------------------------------------------------------------ */

/**
 * @param full  true = walk every step of every workflow (the 5-minute run)
 *              false = only release conditions and run the steps right after them
 */
export async function runDirect({ full = true } = {}) {
  const startedAt = Date.now();
  let tools;
  try {
    tools = await getTools(CFG.accountId);
  } catch (err) {
    log("MCP not reachable:", err.message);
    clients.delete(CFG.accountId); // rebuild the connection next time
    return { status: "mcp_unavailable", error: err.message };
  }
  if (!tools.workflows || !tools.contacts) {
    log(
      `MCP tools missing: ${!tools.workflows ? TOOL_WORKFLOWS : ""} ${!tools.contacts ? TOOL_CONTACTS : ""}`,
    );
    return { status: "error", error: "MCP tools missing" };
  }
  if (!tools.save || !tools.release)
    log(
      `warning: ${TOOL_SAVE_CONDITION} / ${TOOL_RELEASE_CONDITIONS} not found - date & time steps cannot run`,
    );

  let workflows;
  try {
    workflows = await loadWorkflows(tools);
  } catch (err) {
    log("could not load workflows:", err.message);
    return { status: "error", error: err.message };
  }

  const triggered = await releaseDueConditions(tools, workflows);
  if (!full && triggered.size === 0) return { status: "nothing_released" };

  const results = [];
  // sequential on purpose: workflows are triggered one by one
  for (const wf of workflows) {
    let only = null; // full run: every step
    if (!full) {
      const next = triggered.get(wf.workflowId);
      if (!next) continue; // condition check: nothing released in this workflow
      only = new Set([...next, ...descendantsOf(wf, next)]); // the next steps (+ what they unlock this run)
    }
    try {
      results.push(await runWorkflow(wf, tools, only));
    } catch (err) {
      // one broken workflow must never stop the others
      log(`workflow ${wf.workflowId} crashed:`, err);
      results.push({ workflowId: wf.workflowId, error: err.message });
    }
  }

  if (full || results.length)
    log(
      `${full ? "full run" : "condition check"} done in ${Date.now() - startedAt}ms, workflows=${results.length}`,
    );
  return {
    status: "completed",
    full,
    triggered: [...triggered].map(([w, s]) => ({
      workflowId: w,
      steps: [...s],
    })),
    processedTaskCount: results.length,
    results,
  };
}

/* ------------------------------------------------------------------ */
/* Public: the two schedulers                                          */
/* ------------------------------------------------------------------ */

// Both schedulers share this lock: a run waits for the other to finish, so two runs
// never work on the same workflow at the same time.
let lock = Promise.resolve();
function exclusive(fn) {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

function makeScheduler(name, minutes, full) {
  let timer = null;
  let stopped = true;
  let busy = false;
  const tick = async () => {
    if (busy) return; // its previous run is still waiting / running
    busy = true;
    try {
      await exclusive(() => runDirect({ full }));
    } catch (err) {
      log(`${name} run crashed:`, err);
    } finally {
      busy = false;
      if (!stopped) timer = setTimeout(tick, minutes * 60_000);
    }
  };
  return {
    start() {
      if (!stopped) return;
      stopped = false;
      log(`${name} scheduler started, every ${minutes} min`);
      tick();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

const conditionScheduler = makeScheduler(
  "condition",
  CFG.conditionCheckMinutes,
  false,
);
const workflowScheduler = makeScheduler("workflow", CFG.intervalMinutes, true);

const disabled = () =>
  String(process.env.SCHEDULER_ENABLED ?? "true").toLowerCase() === "false";

/** Every SCHEDULER_CONDITION_CHECK_MINUTES (1): release due date & time conditions, trigger their next steps. */
export function startConditionScheduler() {
  if (disabled()) return log("disabled (SCHEDULER_ENABLED=false)");
  conditionScheduler.start();
}

/** Every SCHEDULER_INTERVAL_MINUTES (5): walk every step of every active workflow. */
export function startWorkflowScheduler() {
  if (disabled()) return log("disabled (SCHEDULER_ENABLED=false)");
  log(`time zone ${CFG.timezone}`);
  workflowScheduler.start();
}

export function stopWorkflowScheduler() {
  workflowScheduler.stop();
}
export function stopConditionScheduler() {
  conditionScheduler.stop();
}
