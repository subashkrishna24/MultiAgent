  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeSmsTestAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
      module: "smstest",
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