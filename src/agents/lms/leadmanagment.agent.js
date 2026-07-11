import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeLeadManagementAgent({
   model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "leadmanagement",
    model,
    tools,
    accountId,    
    session
  });


  return await agent.invoke({
    messages: history
  });
}