import { createAgent } from "../../utils/agent.factory.js";

export async function executeContactAgent({
  model,
  tools,
  history,
  accountId,
}) {
  const agent = createAgent({
    module: "contact",

    model,

    tools,

    accountId,
  });

  return await agent.invoke({
    messages: history,
  });
}
