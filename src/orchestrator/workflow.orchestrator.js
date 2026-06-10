import { getMcpClient } from "../services/mcp.service.js";

import { getllmModel } from "../services/llm.service.js";

import { detectIntent } from "../agents/intent/intent.agent.js";

import { filterToolsByModule } from "../services/tool-filter.service.js";

import { executeKnowledgeAgent } from "../agents/knowledge/knowledge.agent.js";

import { executeReportingAgent } from "../agents/reporting/reporting.agent.js";

import { executeContactAgent } from "../agents/contact/contact.agent.js";

import { executeGroupAgent } from "../agents/group/group.agent.js";

import { executeMailCampaignAgent } from "../agents/mail/mailcampaign.agent.js";

import { executeMailTemplateAgent } from "../agents/mail/mailtemplate.agent.js";

import { executeCaptureFormAgent } from "../agents/captureform/captureform.agent.js";

import { buildIntentContext } from "../utils/context-builder.js";

import { executeMailSpamScoreAgent } from "../agents/mail/mailspamscore.agent.js";

import { executeMailTestAgent } from "../agents/mail/mailtest.agent.js";

export async function executeWorkflow(payload) {
  const { history, accountid, apikey, model, p5apikey } = payload;

  const llmModel = getllmModel(model, apikey);

  const lastMessage = history[history.length - 1].content;

  // STEP 1
  const intentContext = buildIntentContext(history);

  const intent = await detectIntent(llmModel, intentContext);

  // STEP 2
  const mcpClient = getMcpClient(accountid, p5apikey);

  const allTools = await mcpClient.getTools();

  // STEP 3
  const filteredTools = filterToolsByModule(allTools, intent.module);

  let response;
  let report_response;
  const recentHistory = history;

  // STEP 4
   if (intent.module === "knowledge") {
    response = await executeKnowledgeAgent({
      model: llmModel,

      tools: filteredTools,

      history: recentHistory,

      accountId: accountid,
    });
  }

  if (intent.module === "reporting") {
    response = await executeReportingAgent({
      model: llmModel,

      tools: filteredTools,

      history: recentHistory,

      accountId: accountid,
    });

    const toolMessages = response.messages.filter(
      (x) => x._getType?.() === "tool",
    );

    if (toolMessages.length == 0) {
      const sql = response.messages[response.messages.length - 1].content;

      const reportTool = allTools.find((x) => x.name === "GetReport");

      report_response = await reportTool.invoke({
        getquery: sql,
      });

      //console.log(report_response);
    } else {
      report_response = toolMessages[0].content;
    }
  }

  if (intent.module === "contact") {
    response = await executeContactAgent({
      model: llmModel,

      tools: filteredTools,

      history: recentHistory,

      accountId: accountid,
    });
  }

  if (intent.module === "group") {
    response = await executeGroupAgent({
      model: llmModel,

      tools: filteredTools,

      history: recentHistory,

      accountId: accountid,
    });
  }

  if (intent.module === "mailcampaign") {
    response = await executeMailCampaignAgent({
      model: llmModel,

      tools: filteredTools,

      history: recentHistory,

      accountId: accountid,
    });
  }

  if (intent.module === "mailtemplate") {
    response = await executeMailTemplateAgent({
      model: llmModel,

      tools: filteredTools,

      history: recentHistory,

      accountId: accountid,
    });
  }
  
  if (intent.module === "captureform") {
    response = await executeCaptureFormAgent({
      model: llmModel,

      tools: filteredTools,

      history: recentHistory,

      accountId: accountid,
    });
  }
   if (intent.module === "mailspamscore") {
    response = await executeMailSpamScoreAgent({
      model: llmModel,

      tools: filteredTools,

      history: recentHistory,

      accountId: accountid,
    });
  }
  if (intent.module === "mailtest") {
    response = await executeMailTestAgent({
      model: llmModel,

      tools: filteredTools,

      history: recentHistory,

      accountId: accountid,
    });
  }

  console.log("Final response from agent:", response);
  await mcpClient.close();

  return {
    module: intent.module,
    message:
      response?.messages?.[response.messages.length - 1]?.content ??
      "No response generated",
    toolmessage: report_response,
  };
}
