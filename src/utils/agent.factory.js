import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { KNOWLEDGE_PROMPT } from "../prompts/knowledge/knowledge.prompt.js";

import { REPORTING_PROMPT } from "../prompts/reporting/reporting.prompt.js";

import { CONTACT_PROMPT } from "../prompts/contact/contact.prompt.js";

import { GROUP_PROMPT } from "../prompts/group/group.prompt.js";

import { MAILCAMPAIGN_PROMPT } from "../prompts/mail/mailcampaign.prompt.js";

import { CAPTUREFORM_PROMPT } from "../prompts/captureform/captureform.prompt.js";

import { MAILTEMPLATE_PROMPT } from "../prompts/mail/mailtemplate.prompt.js";

import { MAILSPAMSCORE_PROMPT } from "../prompts/mail/mailspamscore.prompt.js";

import { MAILTEST_PROMPT } from "../prompts/mail/mailtest.prompt.js";

import { MAILCAMPAIGN_ABTEST_PROMPT } from "../prompts/mail/mailabtestcamapign.prompt.js";

import { SHARED_PROMPT } from "../prompts/shared/shared.prompt.js";

function getPrompt(module) {

  const prompts = {

    knowledge: KNOWLEDGE_PROMPT,

    reporting: REPORTING_PROMPT,

    contact: CONTACT_PROMPT,

    group: GROUP_PROMPT,

    mailcampaign: MAILCAMPAIGN_PROMPT,

    captureform: CAPTUREFORM_PROMPT,

    mailtemplate: MAILTEMPLATE_PROMPT,

    mailspamscore: MAILSPAMSCORE_PROMPT,

    mailtest: MAILTEST_PROMPT,

    mailcampaign_abtest: MAILCAMPAIGN_ABTEST_PROMPT,
  };

  return prompts[module];
}

export function createAgent({
  module,
  model,
  tools,
  accountId,
  session
}) {

const prompt = `${getPrompt(module)}

 ${SHARED_PROMPT}

ACCOUNT:
${accountId}

SESSION:
${JSON.stringify(session || {}, null, 2)}
`;

  return createReactAgent({
    llm: model,
    tools,
    prompt
  });
}