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

    return await agent.invoke({
      messages: [
        {
          role: "system",
          content: uploadedFileContext
        },
        ...history
      ]
    });
  }