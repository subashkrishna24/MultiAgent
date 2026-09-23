import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeCreateOrUpdateLeadAgent({
   model,
  tools,
  history,
  accountId,
  session
}) {
  const agent = createAgent({
    module: "createorupdatelead",
    model,
    tools,
    accountId,    
    session
  });


  return await agent.invoke({
    messages: history
  });
}