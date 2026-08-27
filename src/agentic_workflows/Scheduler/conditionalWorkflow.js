function normalizeValue(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    const unquoted = trimmed.replace(/^['"]|['"]$/g, "");
    if (unquoted === "true") return true;
    if (unquoted === "false") return false;
    const parsed = Date.parse(unquoted);
    if (
      !Number.isNaN(parsed) &&
      unquoted.length > 5 &&
      (unquoted.includes("-") || unquoted.includes("/"))
    ) {
      return parsed;
    }
    return unquoted;
  }
  return value;
}

function resolveContextValue(pathStr, context) {
  if (!pathStr) return undefined;
  const cleanPath = pathStr.trim().replace(/^['"]|['"]$/g, "");

  // Direct match in context
  if (context[cleanPath] !== undefined) {
    return context[cleanPath];
  }

  // Check nested properties (e.g. "step1.status" -> context.step1?.status)
  if (cleanPath.includes(".")) {
    const parts = cleanPath.split(".");
    let current = context;
    let found = true;
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        found = false;
        break;
      }
    }
    if (found && current !== undefined) {
      return current;
    }

    // Special fallback for step status e.g. "step1.status" or "step1.ScheduledStatus"
    const [stepId, ...rest] = parts;
    const prop = rest.join(".");
    if (prop === "status") {
      if (
        context[`${stepId}_success`] === true ||
        context[`${stepId}.success`] === true
      ) {
        return "completed";
      }
      if (context[`${stepId}_status`]) return context[`${stepId}_status`];
      if (context[`${stepId}.status`]) return context[`${stepId}.status`];
    }
    if (context[`${stepId}_${prop}`] !== undefined) {
      return context[`${stepId}_${prop}`];
    }
    if (context[`${stepId}.${prop}`] !== undefined) {
      return context[`${stepId}.${prop}`];
    }
  }

  // Special fallback for trigger conditions e.g. "mailcampaign.isTriggered"
  if (cleanPath.endsWith(".isTriggered") || cleanPath === "isTriggered") {
    return true;
  }

  return undefined;
}

function parseDelayStringToMs(delayVal) {
  if (delayVal == null) return 0;
  if (typeof delayVal === "number") {
    return delayVal * 60 * 1000;
  }
  if (typeof delayVal === "string") {
    const trimmed = delayVal.trim().toLowerCase();
    const match = trimmed.match(
      /^(\d+(?:\.\d+)?)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days)?$/,
    );
    if (match) {
      const num = parseFloat(match[1]);
      const unit = match[2] || "m";
      if (unit.startsWith("s")) return num * 1000;
      if (unit.startsWith("m")) return num * 60 * 1000;
      if (unit.startsWith("h")) return num * 3600 * 1000;
      if (unit.startsWith("d")) return num * 86400 * 1000;
      return num * 60 * 1000;
    }
  }
  return 0;
}

function extractStepDelayMs(step) {
  if (step.delayMs != null) return Number(step.delayMs);
  if (step.delaySeconds != null || step.delay_seconds != null)
    return Number(step.delaySeconds ?? step.delay_seconds) * 1000;
  if (step.delayMinutes != null || step.delay_minutes != null)
    return Number(step.delayMinutes ?? step.delay_minutes) * 60 * 1000;
  if (step.delayHours != null || step.delay_hours != null)
    return Number(step.delayHours ?? step.delay_hours) * 3600 * 1000;
  if (step.delay != null) return parseDelayStringToMs(step.delay);

  const params =
    step.action?.parameters?.args ??
    step.action?.parameters ??
    step.parameters?.args ??
    step.parameters ??
    {};
  if (params.delayMs != null) return Number(params.delayMs);
  if (params.delaySeconds != null || params.delay_seconds != null)
    return Number(params.delaySeconds ?? params.delay_seconds) * 1000;
  if (params.delayMinutes != null || params.delay_minutes != null)
    return Number(params.delayMinutes ?? params.delay_minutes) * 60 * 1000;
  if (params.delayHours != null || params.delay_hours != null)
    return Number(params.delayHours ?? params.delay_hours) * 3600 * 1000;
  if (params.delay != null) return parseDelayStringToMs(params.delay);

  const condStr = typeof step.condition === "string" ? step.condition : "";
  if (condStr) {
    const delayMatch = condStr.match(
      /(?:delay|after)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours)?/i,
    );
    if (delayMatch) {
      const num = parseFloat(delayMatch[1]);
      const unit = delayMatch[2] ? delayMatch[2].toLowerCase() : "m";
      return parseDelayStringToMs(`${num} ${unit}`);
    }
  }

  return 0;
}

export function evaluateCondition(
  condition,
  context = {},
  step = null,
  allStepIds = new Set(),
  currentStepId = null,
) {
  if (!condition) return true;

  // Handle string condition expression, e.g. "step1.status == 'completed'" or "reporting.sentCount > 4"
  if (typeof condition === "string") {
    const trimmed = condition.trim();
    if (!trimmed || trimmed === "true" || trimmed === "1") return true;
    if (trimmed === "false" || trimmed === "0") return false;

    if (/\s+(?:OR|\|\|)\s+/i.test(trimmed)) {
      const parts = trimmed.split(/\s+(?:OR|\|\|)\s+/i);
      return parts.some((part) =>
        evaluateCondition(part, context, step, allStepIds, currentStepId),
      );
    }

    if (/\s+(?:AND|&&)\s+/i.test(trimmed)) {
      const parts = trimmed.split(/\s+(?:AND|&&)\s+/i);
      return parts.every((part) =>
        evaluateCondition(part, context, step, allStepIds, currentStepId),
      );
    }

    if (/^(?:delay|after)\s*[:=]?\s*\d+/i.test(trimmed)) {
      return true;
    }

    // Match binary comparison operator
    const match = trimmed.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (match) {
      const leftExpr = match[1].trim();
      const op = match[2];
      const rightExpr = match[3].trim();

      const prefix = leftExpr.split(".")[0].trim();

      // If the step is referencing itself before execution (e.g. step1 has condition "step1.status == completed")
      // this is the goal state of the step itself, so allow it to run
      if (
        currentStepId &&
        (prefix === currentStepId || leftExpr === currentStepId)
      ) {
        return true;
      }

      const rawLeft = resolveContextValue(leftExpr, context);

      // If variable is not in context yet:
      if (rawLeft === undefined) {
        // If it refers to another step ID in this workflow that hasn't executed, condition is not met yet
        if (allStepIds.has(prefix) && prefix !== currentStepId) {
          return false;
        }
        // If it refers to an external module/field (e.g. reporting.sentCount), allow the step to run its action
        return true;
      }

      const rawRight = normalizeValue(rightExpr);
      const left = normalizeValue(rawLeft);
      const right = normalizeValue(rawRight);

      switch (op) {
        case "==":
          return String(left) === String(right) || left === right;
        case "!=":
          return String(left) !== String(right) && left !== right;
        case ">":
          return Number(left) > Number(right);
        case ">=":
          return Number(left) >= Number(right);
        case "<":
          return Number(left) < Number(right);
        case "<=":
          return Number(left) <= Number(right);
        default:
          return true;
      }
    }
    return true; // Default to true if format is not binary comparison
  }

  // Handle object condition
  if (typeof condition === "object") {
    if (condition.condition && typeof condition.condition === "string") {
      return evaluateCondition(condition.condition, context, step, allStepIds);
    }

    const fieldName = condition.field ?? condition.key;
    const rawLeft = fieldName
      ? resolveContextValue(fieldName, context)
      : undefined;
    if (rawLeft === undefined && fieldName) {
      const prefix = String(fieldName).split(".")[0].trim();
      if (allStepIds.has(prefix)) {
        return false;
      }
      return true;
    }

    const left = normalizeValue(rawLeft);
    const right = normalizeValue(condition.value);

    switch (condition.operator) {
      case "eq":
      case "==":
        return String(left) === String(right) || left === right;
      case "ne":
      case "!=":
        return String(left) !== String(right) && left !== right;
      case "gt":
      case ">":
        return Number(left) > Number(right);
      case "gte":
      case ">=":
        return Number(left) >= Number(right);
      case "lt":
      case "<":
        return Number(left) < Number(right);
      case "lte":
      case "<=":
        return Number(left) <= Number(right);
      case "is_true":
        return rawLeft === true || rawLeft === "true";
      case "is_false":
        return rawLeft === false || rawLeft === "false";
      default:
        return true;
    }
  }

  return true;
}

export function executeConditionalWorkflow(task, context = {}, state = {}) {
  const parameters = task?.action?.parameters ?? task?.parameters ?? {};

  let steps = [];
  if (Array.isArray(parameters.steps) && parameters.steps.length > 0) {
    steps = parameters.steps;
  } else if (
    Array.isArray(parameters.conditions) &&
    parameters.conditions.length > 0
  ) {
    steps = parameters.conditions;
  } else if (Array.isArray(task?.action?.steps)) {
    steps = task.action.steps;
  }

  if (steps.length === 0 && task?.action?.type) {
    steps = [
      {
        id: "step1",
        action: task.action,
        condition: task.action.condition,
      },
    ];
  }

  const sortedSteps = [...steps].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const executedStepIds = new Set(state.executedStepIds ?? []);
  const allStepIds = new Set(
    sortedSteps.map((s, idx) => s.id ?? `step_${s.order ?? idx + 1}`),
  );

  for (const step of sortedSteps) {
    const stepId = step.id ?? `step_${step.order ?? 1}`;
    if (executedStepIds.has(stepId)) continue;

    const dependsOn = step.dependsOn ?? step.depends_on;
    if (dependsOn) {
      const depList = Array.isArray(dependsOn)
        ? dependsOn
        : String(dependsOn)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

      const missingDep = depList.find((depId) => !executedStepIds.has(depId));
      if (missingDep) {
        return {
          status: "pending",
          nextStep: step,
          nextConditionId: missingDep,
          reason: `Waiting for dependency step "${missingDep}" to complete`,
        };
      }
    }

    let conditionToEval = step.condition;
    if (!conditionToEval && step.condition_id) {
      const conditionsList = Array.isArray(parameters.conditions)
        ? parameters.conditions
        : [];
      const foundCond = conditionsList.find((c) => c.id === step.condition_id);
      if (foundCond) {
        conditionToEval = foundCond;
      }
    }

    const isSatisfied = evaluateCondition(
      conditionToEval,
      context,
      step,
      allStepIds,
      stepId,
    );
    if (!isSatisfied) {
      return {
        status: "pending",
        nextStep: step,
        nextConditionId: stepId,
        reason: `Condition for step "${stepId}" not satisfied`,
      };
    }

    // Evaluate time delay condition if specified
    const delayMs = extractStepDelayMs(step);
    if (delayMs > 0) {
      let refTime = null;
      const dependsOn = step.dependsOn ?? step.depends_on;
      if (dependsOn) {
        const depList = Array.isArray(dependsOn)
          ? dependsOn
          : String(dependsOn)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
        const lastDep = depList[depList.length - 1];
        refTime =
          context[`${lastDep}_completedAt`] ??
          context[`${lastDep}.completedAt`] ??
          context[lastDep]?.completedAt;
      }

      if (!refTime && state.executedStepIds?.length > 0) {
        const lastStepId =
          state.executedStepIds[state.executedStepIds.length - 1];
        refTime =
          context[`${lastStepId}_completedAt`] ??
          context[`${lastStepId}.completedAt`];
      }

      if (!refTime) {
        refTime = context.workflowStartedAt ?? context.startTime;
      }

      if (refTime) {
        const nowMs =
          context.now instanceof Date
            ? context.now.getTime()
            : typeof context.now === "number"
              ? context.now
              : Date.now();
        const elapsedMs = nowMs - refTime;
        if (elapsedMs < delayMs) {
          const remainingSec = Math.ceil((delayMs - elapsedMs) / 1000);
          return {
            status: "pending",
            nextStep: step,
            nextConditionId: stepId,
            reason: `Delay condition for step "${stepId}" not met (${remainingSec}s remaining of ${Math.round(delayMs / 60000)}m delay)`,
          };
        }
      }
    }

    return { status: "ready", nextStep: { ...step, id: stepId } };
  }

  return {
    status: "completed",
    executedSteps: Array.from(executedStepIds),
  };
}
