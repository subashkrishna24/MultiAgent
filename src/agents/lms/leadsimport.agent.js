  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeLeadsImportAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
      module: "leadsimport",
      model,
      tools,
      accountId,
      session
    });

    let uploadedFileContext = "SESSION UPLOADED FILES: NONE";

      if (session?.LeadsImport?.length > 0) {
      uploadedFileContext = `
      SESSION UPLOADED FILES:
      ${session.LeadsImport
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