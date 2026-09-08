  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeWebPushTestAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
        module: "webpushtest",
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