import { createAgent } from "../../utils/agent.factory.js";

export async function executeKnowledgeAgent({
  model,
  tools,
  history,
  accountId,
  session,
}) {
  const agent = createAgent({
    module: "knowledge",
    model,
    tools,
    accountId,
    session,
  });

  return await agent.invoke({
    messages: history,
  });
}
