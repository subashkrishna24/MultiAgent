  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeContactImportAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
      module: "contactimport",
      model,
      tools,
      accountId,
      session
    });

    let uploadedFileContext = "SESSION UPLOADED FILES: NONE";

      if (session?.contactImport?.length > 0) {
      uploadedFileContext = `
      SESSION UPLOADED FILES:
      ${session.contactImport
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