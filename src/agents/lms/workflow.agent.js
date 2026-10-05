import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeWorkFlowAgent({
   model,
  tools,
  history,
  accountId,
  session
}) {
  const agent = createAgent({
    module: "workflow",
    model,
    tools,
    accountId,    
    session
  });


  return await agent.invoke({
    messages: history
  });
}