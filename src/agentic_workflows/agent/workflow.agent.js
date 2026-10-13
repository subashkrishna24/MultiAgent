import { createAgent } from "../../utils/agent.factory.js";

export async function executeWorkFlowAgent({
  model,
  tools,
  history,
  accountId,
  session,
  pid,
  actiontype,
}) {
  const agent = createAgent({
    module: "workflow",
    model,
    tools,
    accountId,
    session,
    pid,
    actiontype,
  });

  return await agent.invoke({
    messages: history,
  });
}
