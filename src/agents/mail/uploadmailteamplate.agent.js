import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeMailTemplateUploadFilesAgent({
  model,
  tools,
  history,
  accountId
}) {

  const agent = createAgent({
    module: "mailtemplate",
    model,
    tools,
    accountId
  });

  return await agent.invoke({
    messages: history
  });
}