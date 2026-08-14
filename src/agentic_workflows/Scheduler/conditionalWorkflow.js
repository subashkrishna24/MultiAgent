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
    if (!Number.isNaN(parsed) && unquoted.length > 5 && (unquoted.includes("-") || unquoted.includes("/"))) {
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

    // Special fallback for step status e.g. "step1.status"
    const [stepId, prop] = parts;
    if (prop === "status") {
      if (context[`${stepId}_success`] === true) {
        return "completed";
      }
      if (context[`${stepId}_status`]) {
        return context[`${stepId}_status`];
      }
    }
  }

  // Special fallback for trigger conditions e.g. "mailcampaign.isTriggered"
  if (cleanPath.endsWith(".isTriggered") || cleanPath === "isTriggered") {
    return true;
  }

  return undefined;
}

export function evaluateCondition(condition, context = {}) {
  if (!condition) return true;

  // Handle string condition expression, e.g. "step1.status == 'completed'" or "mailcampaign.isTriggered == true"
  if (typeof condition === "string") {
    const trimmed = condition.trim();
    if (!trimmed || trimmed === "true" || trimmed === "1") return true;
    if (trimmed === "false" || trimmed === "0") return false;

    // Match binary comparison operator
    const match = trimmed.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (match) {
      const leftExpr = match[1];
      const op = match[2];
      const rightExpr = match[3];

      const rawLeft = resolveContextValue(leftExpr, context);
      const rawRight = normalizeValue(rightExpr);

      const left = normalizeValue(rawLeft);
      const right = normalizeValue(rawRight);

      switch (op) {
        case "==":
          return String(left) === String(right) || left === right;
        case "!=":
          return String(left) !== String(right) && left !== right;
        case ">":
          return left > right;
        case ">=":
          return left >= right;
        case "<":
          return left < right;
        case "<=":
          return left <= right;
        default:
          return true;
      }
    }
    return true; // Default to true if format is not binary comparison
  }

  // Handle object condition
  if (typeof condition === "object") {
    if (condition.condition && typeof condition.condition === "string") {
      return evaluateCondition(condition.condition, context);
    }

    const fieldName = condition.field ?? condition.key;
    const rawLeft = fieldName ? resolveContextValue(fieldName, context) : undefined;
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
        return left > right;
      case "gte":
      case ">=":
        return left >= right;
      case "lt":
      case "<":
        return left < right;
      case "lte":
      case "<=":
        return left <= right;
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

  // Extract steps from either parameters.steps or parameters.conditions or task.action.steps
  let steps = [];
  if (Array.isArray(parameters.steps) && parameters.steps.length > 0) {
    steps = parameters.steps;
  } else if (Array.isArray(parameters.conditions) && parameters.conditions.length > 0) {
    steps = parameters.conditions;
  } else if (Array.isArray(task?.action?.steps)) {
    steps = task.action.steps;
  }

  if (steps.length === 0 && task?.action?.type) {
    steps = [{
      id: "step1",
      action: task.action,
      condition: task.action.condition
    }];
  }

  const sortedSteps = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const executedStepIds = new Set(state.executedStepIds ?? []);

  for (const step of sortedSteps) {
    const stepId = step.id ?? `step_${step.order ?? 1}`;
    if (executedStepIds.has(stepId)) continue;

    // Check dependency
    const dependsOn = step.dependsOn ?? step.depends_on;
    if (dependsOn) {
      const depList = Array.isArray(dependsOn)
        ? dependsOn
        : String(dependsOn).split(",").map((s) => s.trim()).filter(Boolean);

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

    // Determine condition for step
    let conditionToEval = step.condition;
    if (!conditionToEval && step.condition_id) {
      const conditionsList = Array.isArray(parameters.conditions) ? parameters.conditions : [];
      const foundCond = conditionsList.find((c) => c.id === step.condition_id);
      if (foundCond) {
        conditionToEval = foundCond;
      }
    }

    const isSatisfied = evaluateCondition(conditionToEval, context);
    if (!isSatisfied) {
      return {
        status: "pending",
        nextStep: step,
        nextConditionId: stepId,
        reason: `Condition for step "${stepId}" not satisfied`,
      };
    }

    return { status: "ready", nextStep: { ...step, id: stepId } };
  }

  return {
    status: "completed",
    executedSteps: Array.from(executedStepIds),
  };
}
