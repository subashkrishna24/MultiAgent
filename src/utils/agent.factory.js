import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { KNOWLEDGE_PROMPT } from "../prompts/knowledge.prompt.js";

import { REPORTING_PROMPT } from "../prompts/reporting.prompt.js";

import { CONTACT_PROMPT } from "../prompts/contact.prompt.js";

import { MAILCAMPAIGN_PROMPT } from "../prompts/mailcampaign.prompt.js";

import { CAPTUREFORM_PROMPT } from "../prompts/captureform.prompt.js";

import { MAILTEMPLATE_PROMPT } from "../prompts/mailtemplate.prompt.js";

import { MAILSPAMSCORE_PROMPT } from "../prompts/mailspamscore.prompt.js";
import { MAILTEST_PROMPT } from "../prompts/mailtest.prompt.js";
function getPrompt(module) {
  const prompts = {
    knowledge: KNOWLEDGE_PROMPT,

    reporting: REPORTING_PROMPT,

    contact: CONTACT_PROMPT,

    mailcampaign: MAILCAMPAIGN_PROMPT,

    captureform: CAPTUREFORM_PROMPT,

    mailtemplate: MAILTEMPLATE_PROMPT,

    mailspamscore: MAILSPAMSCORE_PROMPT ,
    mailtest: MAILTEST_PROMPT};

  return prompts[module];
}

export function createAgent({ module, model, tools, accountId }) {
  const prompt = `
${getPrompt(module)}

ACCOUNT:
${accountId}
`;

  return createReactAgent({
    llm: model,
    tools,
    prompt,
  });
}
