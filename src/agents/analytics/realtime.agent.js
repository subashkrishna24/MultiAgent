import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeRealTimeAgent({
  model,
  tools,
  history,
  accountId
}) {

  const agent = createAgent({
    module: "realtime",
    model,
    tools,
    accountId
  });

  return await agent.invoke({
    messages: history
  });
}