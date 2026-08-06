  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeWhatsAppTemplateAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
      module: "whatsapptemplate",
      model,
      tools,
      accountId,
      session
    });
    
  return await agent.invoke({
    messages: history 
  });
}