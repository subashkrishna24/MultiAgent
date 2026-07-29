  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeSmsTemplateAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
      module: "smstemplate",
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