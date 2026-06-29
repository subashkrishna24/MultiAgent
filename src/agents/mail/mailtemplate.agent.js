import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeMailTemplateAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {
  const agent = createAgent({
    module: "mailtemplate",
    model,
    tools,
    accountId,
    session
  });

  let uploadedFileContext = "SESSION UPLOADED FILES: NONE";

  if (session?.uploadedFile?.length > 0) {
    uploadedFileContext = `
    SESSION UPLOADED FILES:
    ${session.uploadedFile
      .map(file => `- ${file.fileName}`)
      .join("\n")}
    `;
  }

  // 1. Invoke the agent framework execution
  const result = await agent.invoke({
    messages: [
      {
        role: "system",
        role: "system",
        content: uploadedFileContext
      },
      ...history
    ]
  });

  // 2. Clear out session files if the orchestrated workflow completed successfully
  if (result?.metadata?.workflowCompleted === true || result?.workflowCompleted === true) {
    session.uploadedFile = null;
  }

  return result;
}