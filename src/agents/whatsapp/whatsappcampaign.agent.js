import {
  createAgent
} from "../../utils/agent.factory.js";


export async function executeWhatsAppCampaignAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "whatsappcampaign",
    model,
    tools,
    accountId,    
    session
  });

 

  return await agent.invoke({
    messages: history 
  });
}