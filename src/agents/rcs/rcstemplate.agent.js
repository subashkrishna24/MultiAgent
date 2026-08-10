  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeRcsTemplateAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
      module: "rcstemplate",
      model,
      tools,
      accountId,
      session
    });
    return await agent.invoke({
      messages: [
        {
          role: "system"
        },
        ...history
      ]
    });
  }