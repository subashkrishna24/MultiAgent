// Persistent per-workflow execution state, so a restart (or the next 5-minute
// tick) never re-runs a step that already sent its mail.
//
// Stored as JSON on disk (atomic write).  Set SCHEDULER_STATE_FILE to move it.
//   state[workflowId].steps[stepId] = {
//     status: "done" | "failed" | "pending",
//     runs, failures, lastRunAt, completedAt, lastMessage, total, saved
//   }
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve(
  process.env.SCHEDULER_STATE_FILE || "./data/scheduler-state.json",
);

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    cache = {};
  }
  return cache;
}

function flush() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (err) {
    console.error("[scheduler] could not persist state:", err.message);
  }
}

export function getWorkflowState(workflowId) {
  const s = load();
  s[workflowId] ??= { startedAt: Date.now(), steps: {} };
  return s[workflowId];
}

export function getStepState(workflowId, stepId) {
  return getWorkflowState(workflowId).steps[stepId];
}

export function updateStepState(workflowId, stepId, patch) {
  const wf = getWorkflowState(workflowId);
  wf.steps[stepId] = { ...(wf.steps[stepId] ?? { runs: 0, failures: 0 }), ...patch };
  flush();
  return wf.steps[stepId];
}
