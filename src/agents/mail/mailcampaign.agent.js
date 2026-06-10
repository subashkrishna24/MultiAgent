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

  const lastMessage =history[history.length - 1].content.toLowerCase().trim();
  // Next Page
  if (/(next|more)/i.test(lastMessage) &&  /campaign/i.test(lastMessage) &&  /identifier/i.test(lastMessage)) {
    session.campaignidentifierOffset +=session.campaignidentifierFetchNext;
  }
  // Previous Page
  if (/(previous|back)/i.test(lastMessage) &&  /campaign/i.test(lastMessage) &&  /identifier/i.test(lastMessage)){
    session.campaignidentifierOffset -=session.campaignidentifierFetchNext;
    if (session.campaignidentifierOffset < 0) {session.campaignidentifierOffset = 0;}
  }

  return await agent.invoke({
    messages: history
  });
}