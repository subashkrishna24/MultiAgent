  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeWhatsAppTestAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
      module: "whatsapptest",
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