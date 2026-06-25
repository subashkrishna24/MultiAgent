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
<<<<<<< HEAD

    module: "mailtemplateuploadfiles",

=======
    module: "mailtemplate",
>>>>>>> 9a20d1930a8a122dde4439e575d5e3a5a967059d
    model,
    tools,
    accountId
  });

  return await agent.invoke({
    messages: history
  });
}