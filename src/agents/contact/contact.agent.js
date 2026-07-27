import { createAgent } from "../../utils/agent.factory.js";

export async function executeContactAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {
  const agent = createAgent({
    module: "contact",
    model,
    tools,
    accountId,
    session
  });

  return await agent.invoke({
    messages: history,
  });
}
