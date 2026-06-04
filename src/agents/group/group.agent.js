import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeGroupAgent({
  model,
  tools,
  history,
  accountId
}) {

  const agent = createAgent({

    module: "group",

    model,

    tools,

    accountId
  });

  return await agent.invoke({
    messages: history
  });
}