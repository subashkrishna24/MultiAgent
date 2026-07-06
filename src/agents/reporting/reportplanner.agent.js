import { createAgent } from "../../utils/agent.factory.js";

export async function executeReportPlannerAgent({ model, history, accountId }) {
  const agent = createAgent({
    module: "reportplanner",
    model,
    tools: [],
    accountId,
  });

  return await agent.invoke({
    messages: history,
  });
}
