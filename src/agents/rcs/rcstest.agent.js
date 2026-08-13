  import {
    createAgent
  } from "../../utils/agent.factory.js";

  export async function executeRcsTestAgent({
    model,
    tools,
    history,
    accountId,
    session
  }) {
    const agent = createAgent({
      module: "rcstest",
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