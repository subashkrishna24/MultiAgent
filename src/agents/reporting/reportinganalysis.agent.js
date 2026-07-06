import { createAgent } from "../../utils/agent.factory.js";

export async function executeReportingAnalysisAgent({
  model,
  history,
  accountId,
}) {
  const agent = createAgent({
    module: "reportinganalysis",
    model,
    tools: [],
    accountId,
  });

  return await agent.invoke({
    messages: history,
  });
}
