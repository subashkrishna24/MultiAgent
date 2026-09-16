  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeWebPushTemplateAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
      module: "webpushtemplate",
      model,
      tools,
      accountId,
      session
    });
    
  return await agent.invoke({
    messages: history 
  });
}