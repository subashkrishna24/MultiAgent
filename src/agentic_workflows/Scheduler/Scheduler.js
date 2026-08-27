import "dotenv/config";
import { getMcpClient } from "../../services/mcp.service.js";
import { executeAutomationSchedulerAgent } from "../SchedulerAgent/SchedulerAgent.js";
import { getllmModel } from "../../services/llm.service.js";
import { filterToolsByModule } from "../../services/tool-filter.service.js";
import { executeConditionalWorkflow } from "./conditionalWorkflow.js";
import { extractJSON } from "../../utils/json.utils.js";

var defaultTask = null;
var CurrentTaskId = 0;

function parseTaskData(taskData) {
  if (!taskData) return null;
  if (typeof taskData === "object") return taskData;
  if (typeof taskData !== "string") return taskData;

  try {
    return JSON.parse(taskData);
  } catch (firstErr) {
    try {
      const lines = taskData.split(/\r?\n/);
      const fixedLines = lines.map((line) => {
        const match = line.match(/^(\s*"[^"]+"\s*:\s*")([\s\S]*)("\s*,?\s*)$/);
        if (match) {
          const [, start, val, end] = match;
          let cleanVal = val.replace(/"/g, "'");
          const singleQuoteCount = (cleanVal.match(/'/g) || []).length;
          if (singleQuoteCount % 2 !== 0) {
            cleanVal = cleanVal + "'";
          }
          return start + cleanVal + end;
        }
        return line;
      });

      const reassembled = fixedLines.join("\n");
      return JSON.parse(reassembled);
    } catch (secondErr) {
      return null;
    }
  }
}

function extractTaskObject(item) {
  if (!item) return null;
  let data = item;

  // Handle strings (single or multi-encoded JSON)
  for (let i = 0; i < 3 && typeof data === "string"; i++) {
    const trimmed = data.trim();
    if (!trimmed) return null;
    try {
      data = JSON.parse(trimmed);
    } catch {
      data = parseTaskData(trimmed);
      break;
    }
  }

  if (!data || typeof data !== "object") return null;

  // Drill down if wrapped in standard response envelopes
  if (data.TaskData) return extractTaskObject(data.TaskData);
  if (data.task) return extractTaskObject(data.task);
  if (data.Message) return extractTaskObject(data.Message);
  if (Array.isArray(data.Table) && data.Table.length > 0)
    return extractTaskObject(data.Table[0]);
  if (
    data.data &&
    typeof data.data === "object" &&
    (data.data.action || data.data.parameters)
  ) {
    return extractTaskObject(data.data);
  }

  return data;
}

function parseWorkflowTasks(result) {
  if (!result) return [];
  try {
    let parsed = result;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = parseTaskData(parsed);
      }
    }
    if (parsed && typeof parsed === "object") {
      if (parsed.Message) {
        const msg =
          typeof parsed.Message === "string"
            ? parseTaskData(parsed.Message)
            : parsed.Message;
        if (Array.isArray(msg)) return msg;
        if (msg) return [msg];
      }
      if (Array.isArray(parsed.Table)) {
        return parsed.Table;
      }
      if (Array.isArray(parsed)) return parsed;
      return [parsed];
    }
  } catch (err) {
    // Fail silently on invalid workflow tasks
  }
  return [];
}

function parseAgentResult(agentResult) {
  try {
    const lastMessage = agentResult?.messages?.at(-1);
    const content = lastMessage?.content ?? "no response from agent";
    if (typeof content === "object" && content !== null) return content;
    return extractJSON(content);
  } catch (err) {
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isWaitDelayStep(step) {
  const type = step?.action?.type || step?.type;
  return type === "wait_delay" || type === "delay" || type === "wait";
}

function extractDirectDelayMs(step) {
  const params =
    step?.action?.parameters?.args ||
    step?.action?.parameters ||
    step?.parameters?.args ||
    step?.parameters ||
    {};
  if (params.delayMs != null) return Number(params.delayMs);
  if (params.delaySeconds != null || params.delay_seconds != null)
    return Number(params.delaySeconds ?? params.delay_seconds) * 1000;
  if (params.delayMinutes != null || params.delay_minutes != null)
    return Number(params.delayMinutes ?? params.delay_minutes) * 60 * 1000;
  if (params.delayHours != null || params.delay_hours != null)
    return Number(params.delayHours ?? params.delay_hours) * 3600 * 1000;
  if (params.delay != null) {
    if (typeof params.delay === "number") return params.delay * 60 * 1000;
    const match = String(params.delay)
      .trim()
      .toLowerCase()
      .match(
        /^(\d+(?:\.\d+)?)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days)?$/,
      );
    if (match) {
      const num = parseFloat(match[1]);
      const unit = match[2] || "m";
      if (unit.startsWith("s")) return num * 1000;
      if (unit.startsWith("m")) return num * 60 * 1000;
      if (unit.startsWith("h")) return num * 3600 * 1000;
      if (unit.startsWith("d")) return num * 86400 * 1000;
    }
  }
  if (step.delay != null) {
    if (typeof step.delay === "number") return step.delay * 60 * 1000;
    const match = String(step.delay)
      .trim()
      .toLowerCase()
      .match(
        /^(\d+(?:\.\d+)?)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days)?$/,
      );
    if (match) {
      const num = parseFloat(match[1]);
      const unit = match[2] || "m";
      if (unit.startsWith("s")) return num * 1000;
      if (unit.startsWith("m")) return num * 60 * 1000;
      if (unit.startsWith("h")) return num * 3600 * 1000;
      if (unit.startsWith("d")) return num * 86400 * 1000;
    }
  }
  return 0;
}

function resolveTemplateString(str, context) {
  if (typeof str !== "string") return str;
  return str.replace(/\{\{([\w.]+)\}\}/g, (match, path) => {
    // 1. Check direct context path
    if (context[path] !== undefined && context[path] !== null) {
      return typeof context[path] === "object"
        ? JSON.stringify(context[path])
        : String(context[path]);
    }

    // 2. Check nested context path
    const parts = path.split(".");
    let curr = context;
    for (const part of parts) {
      if (curr && typeof curr === "object" && part in curr) {
        curr = curr[part];
      } else {
        curr = undefined;
        break;
      }
    }
    if (curr !== undefined && curr !== null) {
      return typeof curr === "object" ? JSON.stringify(curr) : String(curr);
    }

    // 3. Fallback for result properties (e.g. {{result.openedContacts}} or {{result.total}})
    if (parts[0] === "result" && parts.length > 1) {
      const prop = parts.slice(1).join(".");
      const rawRes =
        context.lastRawToolResult || context.lastResult || context.details;
      if (rawRes && typeof rawRes === "object") {
        if (
          Array.isArray(rawRes) &&
          rawRes.length > 0 &&
          rawRes[0][prop] !== undefined
        ) {
          return typeof rawRes[0][prop] === "object"
            ? JSON.stringify(rawRes[0][prop])
            : String(rawRes[0][prop]);
        }
        if (rawRes[prop] !== undefined) {
          return typeof rawRes[prop] === "object"
            ? JSON.stringify(rawRes[prop])
            : String(rawRes[prop]);
        }
      }
    }

    return match;
  });
}

function resolvePlaceholders(val, context) {
  if (val == null) return val;
  if (typeof val === "string") return resolveTemplateString(val, context);
  if (Array.isArray(val))
    return val.map((item) => resolvePlaceholders(item, context));
  if (typeof val === "object") {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = resolvePlaceholders(v, context);
    }
    return res;
  }
  return val;
}

function buildStepTask(step, context, currentTask) {
  const conditions = currentTask.action?.parameters?.conditions ?? [];
  const stepCondition = conditions.find(
    (c) => c.id === step.condition_id || c.id === step.id,
  );
  const resolvedParameters = resolvePlaceholders(
    step.action?.parameters || {},
    context,
  );

  return {
    ...currentTask,
    action: {
      type: step.action?.type,
      parameters: {
        ...resolvedParameters,
        ...(stepCondition ? { condition: stepCondition } : {}),
        workflow_context: {
          lastSummary: context.lastSummary,
          lastRawToolResult: context.lastRawToolResult,
          lastExecutedTasks: context.lastExecutedTasks,
        },
      },
    },
  };
}

function extractTimingContext(context) {
  const timingContext = {};
  if (!context || typeof context !== "object") return timingContext;

  for (const [k, v] of Object.entries(context)) {
    if (
      k === "workflowStartedAt" ||
      k === "startTime" ||
      k.endsWith("_completedAt") ||
      k.endsWith(".completedAt") ||
      k.endsWith("_delayMs") ||
      k.endsWith(".delayMs") ||
      k.endsWith("_status") ||
      k.endsWith(".status") ||
      k.endsWith("_success") ||
      k.endsWith(".success") ||
      k.endsWith("_scheduledTime") ||
      k.endsWith(".scheduledTime")
    ) {
      timingContext[k] = v;
    }
  }
  return timingContext;
}

const taskExecutionStateStore = new Map();

function restoreTaskState(taskKey, taskItem, currentTask, context, state) {
  let savedState = taskExecutionStateStore.get(taskKey);

  const possiblePayloads = [
    taskItem?.ExecutionData,
    taskItem?.execution_data,
    taskItem?.ExecutionDetails,
    taskItem?.savedWorkflowState,
    taskItem?.context,
    currentTask?.savedWorkflowState,
    currentTask?.context,
    currentTask?.ExecutionData,
  ];

  for (const payload of possiblePayloads) {
    if (!payload) continue;
    try {
      const parsed =
        typeof payload === "string" ? JSON.parse(payload) : payload;
      if (parsed?.savedWorkflowState) {
        savedState = parsed.savedWorkflowState;
        break;
      } else if (Array.isArray(parsed?.executedStepIds)) {
        savedState = parsed;
        break;
      }
    } catch (e) {
      // Ignore parse error
    }
  }

  if (savedState) {
    if (Array.isArray(savedState.executedStepIds)) {
      state.executedStepIds = [
        ...new Set([...state.executedStepIds, ...savedState.executedStepIds]),
      ];
    }
    if (savedState.context && typeof savedState.context === "object") {
      Object.assign(context, savedState.context);
    }
    if (savedState.timing && typeof savedState.timing === "object") {
      if (savedState.timing.workflowStartedAt)
        context.workflowStartedAt = savedState.timing.workflowStartedAt;
      if (savedState.timing.startTime)
        context.startTime = savedState.timing.startTime;
      if (Array.isArray(savedState.timing.stepTimings)) {
        for (const st of savedState.timing.stepTimings) {
          if (st.stepId && st.completedAt) {
            context[`${st.stepId}.completedAt`] = st.completedAt;
            context[`${st.stepId}_completedAt`] = st.completedAt;
          }
          if (st.stepId && st.status) {
            context[`${st.stepId}.status`] = st.status;
            context[`${st.stepId}_status`] = st.status;
          }
        }
      }
    }
  }
}

function persistTaskState(taskKey, context, state) {
  taskExecutionStateStore.set(taskKey, {
    executedStepIds: [...state.executedStepIds],
    timing: {
      workflowStartedAt: context.workflowStartedAt,
      startTime: context.startTime,
      stepTimings: state.executedStepIds.map((id) => ({
        stepId: id,
        completedAt:
          context[`${id}.completedAt`] || context[`${id}_completedAt`],
        delayMs: context[`${id}.delayMs`] || context[`${id}_delayMs`] || 0,
        status:
          context[`${id}.status`] || context[`${id}_status`] || "completed",
      })),
    },
    context: extractTimingContext(context),
  });
}

function normalizeExecutedTasks(executedTasks, stepActionType) {
  return executedTasks.map((task, index) => {
    if (typeof task === "string") {
      return {
        taskId: `task-${index + 1}`,
        taskType: stepActionType,
        taskName: task,
        result: "Success",
      };
    }
    return {
      taskId: task.taskId ?? task.id ?? `task-${index + 1}`,
      taskType: task.taskType ?? stepActionType,
      taskName: task.taskName ?? task.name ?? "Unnamed Task",
      result: task.result ?? "Success",
    };
  });
}

function updateContext(
  context,
  stepId,
  finalResult,
  stepActionType,
  step = null,
) {
  context.lastSummary = finalResult?.summary;
  context.lastRawToolResult =
    finalResult?.rawToolResult ?? finalResult?.details ?? null;
  context.lastExecutedTasks = normalizeExecutedTasks(
    finalResult?.executedTasks ?? [],
    stepActionType,
  );

  const rawStatus = finalResult?.status
    ? String(finalResult.status).toLowerCase()
    : "completed";
  const isSuccess =
    rawStatus === "success" ||
    rawStatus === "completed" ||
    finalResult?.status === true ||
    finalResult?.status === undefined;
  const statusStr = isSuccess ? "completed" : rawStatus;

  context[`${stepId}_success`] = isSuccess;
  context[`${stepId}.success`] = isSuccess;
  context[`${stepId}_status`] = statusStr;
  context[`${stepId}.status`] = statusStr;

  const nowMs = Date.now();
  context[`${stepId}_completedAt`] = nowMs;
  context[`${stepId}.completedAt`] = nowMs;

  // Store step input arguments (e.g. step1.CampaignName)
  const stepArgs =
    step?.action?.parameters?.args ?? step?.action?.parameters ?? {};
  for (const [k, v] of Object.entries(stepArgs)) {
    context[`${stepId}.${k}`] = v;
    context[`${stepId}_${k}`] = v;
    if (context[k] === undefined) {
      context[k] = v;
    }
  }

  // Extract details / rawToolResult from result into context
  const details =
    finalResult?.details ||
    (Array.isArray(finalResult?.rawToolResult)
      ? finalResult?.rawToolResult[0]
      : finalResult?.rawToolResult);
  if (details && typeof details === "object") {
    for (const [k, v] of Object.entries(details)) {
      context[`${stepId}.${k}`] = v;
      context[`${stepId}_${k}`] = v;
      if (context[k] === undefined) {
        context[k] = v;
      }
    }
    // Aliases
    if (details.Name) {
      context[`${stepId}.CampaignName`] = details.Name;
      context[`${stepId}_CampaignName`] = details.Name;
      if (context.CampaignName === undefined)
        context.CampaignName = details.Name;
    }
    if (details.CampaignName) {
      context[`${stepId}.Name`] = details.CampaignName;
      context[`${stepId}_Name`] = details.CampaignName;
    }
    if (details.GroupName) {
      context[`${stepId}.GroupName`] = details.GroupName;
      context[`${stepId}_GroupName`] = details.GroupName;
    }
    if (details.ScheduledStatus !== undefined) {
      context[`${stepId}.ScheduledStatus`] = details.ScheduledStatus;
      context[`${stepId}_ScheduledStatus`] = details.ScheduledStatus;
    }
  }

  // Handle explicit outputs mapping if defined on step (e.g. {{result.openedContacts}})
  if (step?.outputs && typeof step.outputs === "object") {
    for (const [outKey, outVal] of Object.entries(step.outputs)) {
      const resolvedVal = resolveTemplateString(outVal, context);
      context[`${stepId}.${outKey}`] = resolvedVal;
      context[`${stepId}_${outKey}`] = resolvedVal;
      context[outKey] = resolvedVal;
    }
  }

  context[stepId] = {
    status: statusStr,
    success: isSuccess,
    completedAt: nowMs,
    result: finalResult,
    ...(typeof details === "object" ? details : {}),
    ...stepArgs,
  };

  const resultData = finalResult?.rawToolResult ?? finalResult?.details;
  context[`${stepId}_hasData`] = Array.isArray(resultData)
    ? resultData.length > 0
    : resultData != null && Object.keys(resultData).length > 0;

  if (
    resultData &&
    typeof resultData === "object" &&
    !Array.isArray(resultData)
  ) {
    Object.assign(context, resultData);
  }
  if (finalResult && typeof finalResult === "object") {
    for (const [key, val] of Object.entries(finalResult)) {
      if (key !== "executedTasks" && key !== "summary" && val !== undefined) {
        context[key] = val;
      }
    }
  }
}

export async function runDirect() {
  const accountId = 4;
  const model = "gpt-4o-mini";
  const apikey = process.env.MCP_API_KEY ?? "";
  const llmApiKey = process.env.OPENAI_API_KEY ?? "";

  const mcpClient = getMcpClient(accountId, apikey);
  const llmModel = getllmModel(model, llmApiKey);
  let allTools = [];
  try {
    allTools = await mcpClient.getTools();
  } catch (err) {
    // Optional tool fetch fallback
  }

  let taskList = [];

  try {
    const workflowTool = allTools.find(
      (t) => t.name === "GetAgentWorkFlowDetails",
    );
    if (workflowTool) {
      const result = await workflowTool.invoke({
        Id: 0,
      });
      taskList = parseWorkflowTasks(result);
    }
  } catch (err) {
    // Ignore workflow tool fetch error
  }

  if (!taskList || taskList.length === 0) {
    return { status: "no_task" };
  }

  const results = [];

  for (const taskItem of taskList) {
    const taskId = taskItem?.Id ?? taskItem?.task_id ?? taskItem?.id ?? 0;
    const currentTask = extractTaskObject(taskItem);
    console.log(currentTask);
    if (!currentTask) {
      continue;
    }

    if (!currentTask.action) {
      if (
        currentTask.type ||
        currentTask.parameters ||
        currentTask.conditions ||
        currentTask.steps
      ) {
        currentTask.action = {
          type: currentTask.type || "workflow",
          parameters: currentTask.parameters || {
            conditions: currentTask.conditions || currentTask.steps || [],
          },
        };
      } else {
        continue;
      }
    }

    const taskKey = taskId
      ? `task_${taskId}`
      : currentTask.name
        ? `task_${currentTask.name}`
        : "task_default";
    const state = { executedStepIds: [] };
    const nowMs = Date.now();
    const context = {
      now: new Date(nowMs),
      workflowStartedAt: nowMs,
      startTime: nowMs,
    };

    restoreTaskState(taskKey, taskItem, currentTask, context, state);

    let workflowRunStatus = "completed";
    let pendingReason = null;

    try {
      while (true) {
        const result = executeConditionalWorkflow(currentTask, context, state);

        console.log(result);
        if (result.status === "completed") {
          workflowRunStatus = "completed";
          break;
        }

        if (result.status === "pending") {
          workflowRunStatus = "pending";
          pendingReason = result.reason;
          break;
        }

        const { nextStep } = result;

        let finalResult = null;
        let agentResult = null;

        if (isWaitDelayStep(nextStep)) {
          const delayMs = extractDirectDelayMs(nextStep);
          // If delay is <= 2 minutes (120000ms), wait in-process
          if (delayMs > 0 && delayMs <= 120000) {
            await sleep(delayMs);
          }
          finalResult = {
            status: "success",
            summary: `Wait delay completed (${delayMs > 0 ? `${delayMs / 1000}s` : "instant"})`,
            executedTasks: [
              {
                taskId: `task-${state.executedStepIds.length + 1}`,
                taskType: "wait_delay",
                taskName: nextStep.name || "Wait Delay",
                result: "Success",
              },
            ],
            delayMs,
          };
        } else {
          const stepTask = buildStepTask(nextStep, context, currentTask);
          const stepModule =
            nextStep?.action?.parameters?.module ||
            nextStep?.action?.module ||
            currentTask?.action?.parameters?.module ||
            currentTask?.action?.module ||
            "mailcampaign";

          const stepFilteredTools = filterToolsByModule(allTools, stepModule);

          agentResult = await executeAutomationSchedulerAgent({
            filteredTools: stepFilteredTools,
            llmModel,
            accountId,
            taskJson: stepTask,
            module: stepModule,
          });
          finalResult = parseAgentResult(agentResult);
        }

        state.executedStepIds.push(nextStep.id);
        updateContext(
          context,
          nextStep.id,
          finalResult,
          nextStep.action?.type || "action",
          nextStep,
        );
        persistTaskState(taskKey, context, state);

        const saveTool = allTools.find(
          (t) => t.name === "SaveAgentWorkFlowDetails",
        );

        if (saveTool && taskId) {
          try {
            await saveTool.invoke({
              GenerativeAIAgentsId: taskId,
              ExecutionData: JSON.stringify({
                savedWorkflowState: {
                  executedStepIds: state.executedStepIds,
                  timing: {
                    workflowStartedAt: context.workflowStartedAt,
                    startTime: context.startTime,
                    stepTimings: state.executedStepIds.map((id) => ({
                      stepId: id,
                      completedAt:
                        context[`${id}.completedAt`] ||
                        context[`${id}_completedAt`],
                      delayMs:
                        context[`${id}.delayMs`] ||
                        context[`${id}_delayMs`] ||
                        0,
                      status:
                        context[`${id}.status`] ||
                        context[`${id}_status`] ||
                        "completed",
                    })),
                  },
                  context: extractTimingContext(context),
                },
              }),
              status: true,
            });
          } catch (saveErr) {
            // Ignore optional tool save failure
          }
        }

        if (
          !finalResult ||
          (finalResult.status &&
            finalResult.status.toLowerCase() !== "success" &&
            finalResult.status.toLowerCase() !== "error")
        ) {
          break;
        }

        if (
          finalResult?.nextStep &&
          finalResult.nextStep.shouldTriggerNext === false
        ) {
          break;
        }
      }
    } catch (err) {
      // Error in task execution
    }

    results.push({
      taskId,
      status: workflowRunStatus,
      ...(pendingReason ? { pendingReason } : {}),
      executedStepIds: state.executedStepIds,
      context,
    });
  }

  return {
    status: "completed",
    processedTaskCount: taskList.length,
    results,
  };
}

await runDirect();
