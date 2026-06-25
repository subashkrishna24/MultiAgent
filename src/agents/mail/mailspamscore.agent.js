import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeMailSpamScoreAgent({
  model,
  tools,
  history,
  accountId
}) {

  const agent = createAgent({
    module: "mailspamscore",
    model,
    tools,
    accountId
  });

  return await agent.invoke({
    messages: history
  });
}