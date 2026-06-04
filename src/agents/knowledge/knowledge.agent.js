import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeKnowledgeAgent({
  model,
  tools,
  history,
  accountId
}) {

  const agent = createAgent({

    module: "knowledge",

    model,

    tools,

    accountId
  });

  return await agent.invoke({
    messages: history
  });
}