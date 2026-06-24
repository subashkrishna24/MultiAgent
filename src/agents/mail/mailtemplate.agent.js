import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeMailTemplateAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "mailtemplate",
    model,
    tools,
    accountId,    
    session
  });

  return await agent.invoke({
    messages: history
  });
}