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
import { executeMailTemplateUploadFilesAgent } from "../agents/mail/uploadmailteamplate.agent.js";
import { getSession } from "../store/session.store.js";
import { handlePagination } from "../utils/pagination.helper.js";
import { prepareUserDetails } from "../utils/shared.helper.js";
import { getDateContext } from "../utils/datecontext.helper.js";

export async function executeWorkflow(payload) {
  const {
    history,
    accountid,
    apikey,
    model,
    p5apikey,
    uploadedfile,
    userdetails,
    machineid,
  } = payload;

  // Session
  const session = getSession(machineid);

  // User Details
  prepareUserDetails(userdetails, session);

  // Upload Files
  if (uploadedfile?.length > 0) {
    var Files = [];
    for (const file of uploadedfile) {
      Files.push({
        fileName: file.fileName,
        fileId: file.fileId,
      });
    }
    session.uploadedFile = Files;
  }

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
  let workflowCompleted = false;
  let recommendedActions = [];

  //Add fromdate and todate in prompt
  const recentHistory = [
    {
      role: "system",
      content: getDateContext(),
    },
    ...history,
  ];

  handlePagination(recentHistory, session, intent.module);

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
    response = await executeMailTemplateAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }
  if (intent.module === "mailtemplateuploadfiles") {
    response = await executeMailTemplateUploadFilesAgent({
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
