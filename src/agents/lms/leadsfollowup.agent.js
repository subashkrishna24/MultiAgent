import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeLeadsFollowUpAgent({
   model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "leadsfollowup",
    model,
    tools,
    accountId,    
    session
  });


  return await agent.invoke({
    messages: history
  });
}