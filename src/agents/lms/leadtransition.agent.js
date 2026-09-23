import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeLeadTransitionAgent({
   model,
  tools,
  history,
  accountId,
  session
}) {
  const agent = createAgent({
    module: "leadtransition",
    model,
    tools,
    accountId,    
    session
  });


  return await agent.invoke({
    messages: history
  });
}