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
import { executeMailAbTestCampaignAgent } from "../agents/mail/mailabtestcamapign.agent.js";
import { getPagingSession } from "../store/paging.store.js";
import { getModuleScopedHistory } from "../utils/module.utils.js"; // Included for history trimming

export async function executeWorkflow(payload) {
  const {
    history,
    accountid,
    apikey,
    model,
    p5apikey,
    uploadedfile,
    userdetails,
  } = payload;

  // Session
  const session = getPagingSession(accountid);

  var workflowCompleted = false;
  var recommendedActions = [];
  if (userdetails != null) {
    userdetails.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    session.UserDetails = userdetails;
  }

  if (uploadedfile?.length > 0) {
    let Files = [];
    for (const file of uploadedfile) {
      Files.push({
        fileName: file.fileName,
        fileId: file.fileId,
      });
    }
    session.uploadedFile = Files;
  }

  const llmModel = getllmModel(model, apikey);
  const lastMessage = history[history.length - 1].content.toLowerCase().trim();

  // STEP 1
  const intentContext = buildIntentContext(history);
  let intent = await detectIntent(llmModel, intentContext);

  // ==========================================
  // FIX: STATE-BASED MODULE LOCKING GUARDRAIL
  // ==========================================
  if (session.activeModule === "mailtemplate") {
    // Explicit commands that are allowed to break the lock to go to mailcampaign
    const explicitCampaignSwitch =
      /(create|schedule|update|send|manage)\s+mail\s+campaign/i.test(
        lastMessage,
      );

    if (!explicitCampaignSwitch) {
      // Force the module to stay as mailtemplate
      intent.module = "mailtemplate";
    } else {
      // User requested a hard module switch; wipe template drafts safely
      session.activeModule = null;
      session.isWaitingForTemplateInput = false;
      session.draftTemplate = {};
    }
  }
  // ==========================================

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
      session,
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
      session,
    });
  }

  if (intent.module === "mailcampaign") {
    response = await executeMailCampaignAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "mailtemplate") {
    // Set active session context before calling agent
    session.activeModule = "mailtemplate";
    session.isWaitingForTemplateInput = true;

    // Filter context history so template agent isn't derailed by stale previous module content
    //const scopedHistory = getModuleScopedHistory(recentHistory, "mailtemplate");

    response = await executeMailTemplateAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
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

  if (intent.module === "mailcampaign_abtest") {
    response = await executeMailAbTestCampaignAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
    });
  }

  console.log("Final response from agent:", response);
  await mcpClient.close();

  let response_msg =
    response?.messages?.[response.messages.length - 1]?.content ??
    "No response generated";
  if (response_msg.includes("WORKFLOW_COMPLETED:true")) {
    workflowCompleted = true;
  }
  const match = response_msg.match(/RECOMMENDED_ACTIONS:\s*(\[[^\]]*\])/);
  if (match) {
    recommendedActions = JSON.parse(match[1]);
  }
  const final_cleanMessage = response_msg
    .replace(/(WORKFLOW_COMPLETED:(true|false)|RECOMMENDED_ACTIONS:.*)/g, "")
    .trim();

  return {
    module: intent.module,
    message: final_cleanMessage,
    toolmessage: report_response,
    workflowcompleted: workflowCompleted,
    actions: recommendedActions,
  };
}
