import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeGroupAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "group",
    model,
    tools,
    accountId,
    session
  });


  return await agent.invoke({
    messages: history
  });
}