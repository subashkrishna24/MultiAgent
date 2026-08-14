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
      throw firstErr;
    }
  }
}

function parseWorkflowTasks(result) {
  if (!result) return [];
  try {
    const parsed = typeof result === "string" ? parseTaskData(result) : result;
    if (parsed && parsed.Message) {
      const msg =
        typeof parsed.Message === "string"
          ? parseTaskData(parsed.Message)
          : parsed.Message;
      if (Array.isArray(msg)) return msg;
      if (msg) return [msg];
    }
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "object") return [parsed];
  } catch (err) {
    // Fail silently or return empty array on invalid workflow tasks
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

function buildStepTask(step, context, currentTask) {
  const conditions = currentTask.action?.parameters?.conditions ?? [];
  const stepCondition = conditions.find(
    (c) => c.id === step.condition_id || c.id === step.id,
  );

  return {
    ...currentTask,
    action: {
      type: step.action?.type,
      parameters: {
        ...step.action?.parameters,
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

function updateContext(context, stepId, finalResult, stepActionType) {
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
  context[stepId] = {
    status: statusStr,
    success: isSuccess,
    result: finalResult,
  };

  const resultData = finalResult?.rawToolResult ?? finalResult?.details;
  context[`${stepId}_hasData`] = Array.isArray(resultData)
    ? resultData.length > 0
    : resultData != null && Object.keys(resultData).length > 0;
}

export async function runDirect(customTask = null) {
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
  const filteredTools = filterToolsByModule(allTools, "mailcampaign");

  let taskList = [];

  if (customTask) {
    taskList = Array.isArray(customTask)
      ? customTask
      : [{ Id: 0, TaskData: customTask }];
  } else {
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
  }

  if (!taskList || taskList.length === 0) {
    return { status: "no_task" };
  }

  const results = [];

  for (const taskItem of taskList) {
    const taskId = taskItem.Id ?? taskItem.task_id ?? 0;
    let currentTask = null;
    try {
      currentTask =
        typeof taskItem.TaskData === "string"
          ? parseTaskData(taskItem.TaskData)
          : (taskItem.TaskData ?? taskItem);
    } catch (parseErr) {
      continue;
    }

    if (!currentTask || !currentTask.action) {
      continue;
    }

    const state = { executedStepIds: [] };
    const context = { now: new Date() };

    try {
      while (true) {
        const result = executeConditionalWorkflow(currentTask, context, state);

        if (result.status === "completed") {
          break;
        }

        if (result.status === "pending") {
          break;
        }

        const { nextStep } = result;

        const stepTask = buildStepTask(nextStep, context, currentTask);
        const stepModule =
          nextStep?.action?.parameters?.module ||
          nextStep?.action?.module ||
          currentTask?.action?.parameters?.module ||
          currentTask?.action?.module ||
          "mailcampaign";

        const stepFilteredTools = filterToolsByModule(allTools, stepModule);

        const agentResult = await executeAutomationSchedulerAgent({
          filteredTools: stepFilteredTools,
          llmModel,
          accountId,
          taskJson: stepTask,
          module: stepModule,
        });
        const finalResult = parseAgentResult(agentResult);

        const saveTool = allTools.find(
          (t) => t.name === "SaveAgentWorkFlowDetails",
        );

        if (saveTool && taskId) {
          try {
            await saveTool.invoke({
              GenerativeAIAgentsId: taskId,
              ExecutionData: JSON.stringify(agentResult),
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

        state.executedStepIds.push(nextStep.id);
        updateContext(context, nextStep.id, finalResult, nextStep.action.type);

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
