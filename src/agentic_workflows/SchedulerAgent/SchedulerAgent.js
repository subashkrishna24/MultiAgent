import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { toolcalling } from "../prompts/toolcalling.js";
import { MODULES } from "../../constants/modules.js";
import { getPrompt } from "../../utils/agent.factory.js";
import { SHARED_PROMPT } from "../../prompts/shared/shared.prompt.js";

export async function executeAutomationSchedulerAgent({
  filteredTools,
  llmModel,
  accountId,
  taskJson,
  module = "mailcampaign",
}) {
  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = toolcalling
    .replace("{{today}}", today)
    .replace("{{account_id}}", accountId)
    .replace("{{task_json}}", JSON.stringify(taskJson, null, 2));

  let commonPrompt = "";
  if (module !== "knowledge" && module !== "reporting") {
    commonPrompt = SHARED_PROMPT;
  }

  const prompt = `
${commonPrompt}

${getPrompt(module)}

${systemPrompt}
`;

  const agent = createReactAgent({
    llm: llmModel,
    tools: filteredTools,
    prompt,
  });

  const response = await agent.invoke({
    messages: [
      {
        role: "user",
        content:
          "Execute the automation task. Return full details in the final JSON.",
      },
    ],
  });

  return response;
}
