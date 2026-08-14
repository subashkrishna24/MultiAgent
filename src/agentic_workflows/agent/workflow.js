import { flowplanner } from "../../agentic_workflows/prompts/flowplanner.js";
import { ParameterCollectorPrompt } from "../../agentic_workflows/prompts/ParameterCollector.js";

export async function executeWorkflowAgent({
  model,
  tools,
  history,
  accountId,
  session,
}) {
  if (session?.IsAgentWorkflow) {
    const plannerPrompt = `
${flowplanner}

ACCOUNT:
${accountId}

SESSION:
${JSON.stringify(session || {}, null, 2)}

history:
${JSON.stringify(history || [], null, 2)}
`;

    const plannerResult = await model.invoke([
      {
        role: "user",
        content: plannerPrompt,
      },
    ]);

    const flowPlannerResult = plannerResult?.content || "";

    console.log("FLOW PLANNER RESULT:", flowPlannerResult);

    const parameterPrompt = `
${ParameterCollectorPrompt}

PREVIOUS FLOWPLANNER RESULT:
${flowPlannerResult}

ACCOUNT:
${accountId}

SESSION:
${JSON.stringify(session || {}, null, 2)}

history:
${JSON.stringify(history || [], null, 2)}
`;

    const finalResult = await model.invoke([
      {
        role: "user",
        content: parameterPrompt,
      },
    ]);

    return finalResult;
  }

  return null;
}
