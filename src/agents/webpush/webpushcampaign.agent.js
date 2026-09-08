import {
  createAgent
} from "../../utils/agent.factory.js";


export async function executeWebPushCampaignAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "webpushcampaign",
    model,
    tools,
    accountId,    
    session
  });

 

  return await agent.invoke({
    messages: history 
  });
}