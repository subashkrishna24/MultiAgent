import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeCaptureFormAgent({
  model,
  tools,
  history,
  accountId
}) {

  const agent = createAgent({
    module: "captureform",
    model,
    tools,
    accountId
  });

  return await agent.invoke({
    messages: history
  });
}