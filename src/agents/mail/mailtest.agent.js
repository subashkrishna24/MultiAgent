import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeMailTestAgent({
  model,
  tools,
  history,
  accountId
}) {

  const agent = createAgent({
    module: "mailtest",
    model,
    tools,
    accountId
  });

  return await agent.invoke({
    messages: history
  });
}