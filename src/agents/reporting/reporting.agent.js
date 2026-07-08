import { createAgent } from "../../utils/agent.factory.js";

export async function executeReportingAgent({
  model,
  tools,
  history,
  accountId,
}) {
  const agent = createAgent({
    module: "reporting",
    model,
    tools,
    accountId,
  });

  return await agent.invoke({
    messages: history,
  });
}
