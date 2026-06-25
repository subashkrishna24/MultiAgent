import {
  createAgent
} from "../../utils/agent.factory.js";


export async function executeMailCampaignAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "mailcampaign",
    model,
    tools,
    accountId,    
    session
  });

 

  return await agent.invoke({
    messages: history // Send the sanitized timeline to the agent
  });
}