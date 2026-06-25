import {
  createAgent
} from "../../utils/agent.factory.js"; 
export async function executeMailAbTestCampaignAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "mailcampaign_abtest",
    model,
    tools,
    accountId,    
    session
  });

  return await agent.invoke({
    messages: history 
  });
}