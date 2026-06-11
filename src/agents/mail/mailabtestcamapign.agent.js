import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeMailAbTestCampaignAgent({
  model,
  tools,
  history,
  accountId
}) {

  const agent = createAgent({

    module: "mailcampaign_abtest",

    model,

    tools,

    accountId
  });

  return await agent.invoke({
    messages: history
  });
}