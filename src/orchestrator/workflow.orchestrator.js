import { getMcpClient } from "../services/mcp.service.js";
import { getllmModel } from "../services/llm.service.js";
import { detectIntent } from "../agents/intent/intent.agent.js";
import { filterToolsByModule } from "../services/tool-filter.service.js";
import { executeKnowledgeAgent } from "../agents/knowledge/knowledge.agent.js";
import { executeReportingAgent } from "../agents/reporting/reporting.agent.js";
import { executeReportPlannerAgent } from "../agents/reporting/reportplanner.agent.js";
import { executeReportingAnalysisAgent } from "../agents/reporting/reportinganalysis.agent.js";
import { executeContactAgent } from "../agents/contact/contact.agent.js";
import { executeGroupAgent } from "../agents/group/group.agent.js";
import { executeMailCampaignAgent } from "../agents/mail/mailcampaign.agent.js";
import { executeMailTemplateAgent } from "../agents/mail/mailtemplate.agent.js";
import { executeCaptureFormAgent } from "../agents/captureform/captureform.agent.js";
import { buildIntentContext } from "../utils/context-builder.js";
import { extractJSON } from "../utils/json.utils.js";
import { executeMailSpamScoreAgent } from "../agents/mail/mailspamscore.agent.js";
import { executeMailTestAgent } from "../agents/mail/mailtest.agent.js";
import { executeMailAbTestCampaignAgent } from "../agents/mail/mailabtestcamapign.agent.js";
import { getSession, clearPagingSession } from "../store/session.store.js";
import { handlePagination } from "../utils/pagination.helper.js";
import {
  prepareUserDetails,
  cleanReportEntry,
  cleanMergedResults,
} from "../utils/shared.helper.js";
import { getDateContext, setTimeZone } from "../utils/datecontext.helper.js";
import { executeContactImportAgent } from "../agents/contact/contactimport.agent.js";
import { executeLeadsImportAgent } from "../agents/lms/leadsimport.agent.js";
import { executeLeadManagementAgent } from "../agents/lms/leadmanagment.agent.js";
import { executeLeadsFollowUpAgent } from "../agents/lms/leadsfollowup.agent.js";
import { executeSendMailToLeadAgent } from "../agents/lms/sendmailtolead.agent.js";
import { executeSmsTemplateAgent } from "../agents/sms/smstemplate.agent.js";
import { executeSmsTestAgent } from "../agents/sms/smstest.agent.js";
import { executeSmsCampaignAgent } from "../agents/sms/smscampaign.agent.js";
import { executeRcsTemplateAgent } from "../agents/rcs/rcstemplate.agent.js";
import { executeRcsTestAgent } from "../agents/rcs/rcstest.agent.js";
import { executeRcsCampaignAgent } from "../agents/rcs/rcscampaign.agent.js";
import { executeWorkflowAgent } from "../agentic_workflows/agent/workflow.js";
import { executeWhatsAppTemplateAgent } from "../agents/whatsapp/whatsapptemplate.agent.js";
import { executeWhatsAppTestAgent } from "../agents/whatsapp/whatsapptest.agent.js";
import { executeWhatsAppCampaignAgent } from "../agents/whatsapp/whatsappcampaign.agent.js";
import { checkClarification } from "../utils/json.utils.js";
import { executeWebPushTemplateAgent } from "../agents/webpush/webpushtemplate.agent.js";
import { executeWebPushTestAgent } from "../agents/webpush/webpushtest.agent.js";
import { executeWebPushCampaignAgent } from "../agents/webpush/webpushcampaign.agent.js";
import { checkQueryPrompt } from "../prompts/shared/checkquery.prompt.js";
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
    isagentworkflow,
  } = payload;
  setTimeZone(userdetails?.timeZone);
  if (history.length === 1) {
    clearPagingSession(machineid);
  }

  // Session
  const session = getSession(machineid);

  if (session.IsAgentWorkflow !== isagentworkflow) {
    session.agenticWorkflowHandled = false;
  }

  session.IsAgentWorkflow = isagentworkflow;

  // User Details
  prepareUserDetails(userdetails, session);

  // Upload Files
  if (uploadedfile?.length > 0) {
    const Files = [];
    let hasContactImport = false;
    let hasLeadsImport = false;

    for (const file of uploadedfile) {
      Files.push({
        fileName: file.fileName,
        fileId: file.fileId,
        jsonmappingfields: file.importfields,
      });

      const fileType = file.type?.toLowerCase();

      if (fileType === "contact import") {
        hasContactImport = true;
      } else if (fileType === "leads import") {
        hasLeadsImport = true;
      }
    }

    if (hasContactImport) {
      session.contactImport = Files;
    } else if (hasLeadsImport) {
      session.LeadsImport = Files;
    } else {
      session.uploadedFile = Files;
    }
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
  let modulecheck = [
    "leadmanagement",
    "leadsfollowup",
    "leadsimport",
    "sendmailtolead",
    "knowledge",
  ];
  //Add fromdate and todate in prompt
  const recentHistory = [
    {
      role: "system",
      content: getDateContext(),
    },
    ...history,
  ];

  handlePagination(recentHistory, session, intent.module);

  if (isagentworkflow) {
    response = await executeWorkflowAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });

    console.log("Workflow response:", response);

    let response_msg = response?.content ?? "No response generated";

    let workflowCompleted = false;
    let recommendedActions = [];

    if (response_msg.includes("WORKFLOW_COMPLETED:true")) {
      workflowCompleted = true;
    }

    const match = response_msg.match(/RECOMMENDED_ACTIONS:\s*(\[[^\]]*\])/);

    if (match) {
      try {
        recommendedActions = JSON.parse(match[1]);
      } catch (error) {
        console.error("Failed to parse recommended actions:", error);
      }
    }

    const final_cleanMessage = response_msg
      .replace(/(WORKFLOW_COMPLETED:(true|false)|RECOMMENDED_ACTIONS:.*)/g, "")
      .trim();

    return {
      module: intent.module,
      message: final_cleanMessage,
      toolmessage: recommendedActions,
      workflowcompleted: workflowCompleted,
      actions: [],
    };
  }

  if (!modulecheck.includes(intent.module.toLowerCase())) {
    const priorTurns = recentHistory.slice(-10);
    const currentMessage = history[history.length - 1].content;

    const formattedHistory = priorTurns
      .map((msg) => {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        return `${msg.role.toUpperCase()}: ${text}`;
      })
      .join("\n\n");

    const userPayload = `CONVERSATION_HISTORY:
${formattedHistory || "None"}

LATEST_USER_QUERY:
${currentMessage}`;

    const data = await llmModel.invoke([
      {
        role: "system",
        content: checkQueryPrompt,
      },
      {
        role: "user",
        content: userPayload,
      },
    ]);

    const rawContent =
      typeof data.content === "string"
        ? data.content
        : data.content?.[0]?.text || "";

    const result = rawContent
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsedResult;

    try {
      parsedResult = JSON.parse(result);
    } catch (error) {
      console.error("Invalid LLM response from checkQueryPrompt:", result);
      parsedResult = { needsClarification: false, message: "" };
    }

    if (parsedResult.needsClarification) {
      return {
        module: "",
        message: parsedResult.message || "",
        toolmessage: [],
        workflowcompleted: false,
        actions: [],
      };
    }
  }
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
    const reportTool = filteredTools.find((t) => t.name === "GetReport");

    const lastUserMessage = recentHistory
      .filter((m) => m.role === "user")
      .slice(-5)
      .map((m) => m.content)
      .join("\n");

    const toolResponse = await reportTool.invoke({
      getquery: lastUserMessage ?? "",
      type: 1,
    });

    const result = JSON.parse(toolResponse);

    response = {
      messages: [
        {
          role: "assistant",
          content: result.Message || "No response generated",
        },
      ],
    };

    report_response = {
      dbdata: result.sucess ? result.dbdata : JSON.stringify([]),
    };
  }

  if (intent.module === "contact") {
    response = await executeContactAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
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
  if (intent.module === "contactimport") {
    response = await executeContactImportAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }
  if (intent.module === "leadsimport") {
    response = await executeLeadsImportAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }
  if (intent.module === "leadmanagement") {
    response = await executeLeadManagementAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }
  if (intent.module === "leadsfollowup") {
    response = await executeLeadsFollowUpAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }
  if (intent.module === "sendmailtolead") {
    response = await executeSendMailToLeadAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }
  if (intent.module === "smstemplate") {
    response = await executeSmsTemplateAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "smstest") {
    response = await executeSmsTestAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "smscampaign") {
    response = await executeSmsCampaignAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "rcstemplate") {
    response = await executeRcsTemplateAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "rcstest") {
    response = await executeRcsTestAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "rcscampaign") {
    response = await executeRcsCampaignAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "realtime") {
    response = await executeRealTimeAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "whatsapptemplate") {
    response = await executeWhatsAppTemplateAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "whatsapptest") {
    response = await executeWhatsAppTestAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "whatsappcampaign") {
    response = await executeWhatsAppCampaignAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "webpushtemplate") {
    response = await executeWebPushTemplateAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "webpushtest") {
    response = await executeWebPushTestAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
    });
  }

  if (intent.module === "webpushcampaign") {
    response = await executeWebPushCampaignAgent({
      model: llmModel,
      tools: filteredTools,
      history: recentHistory,
      accountId: accountid,
      session,
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

  var RemoveRecommendations = [
    "contact",
    "leadmanagement",
    "leadsfollowup",
    "leadsimport",
  ];

  const match = response_msg.match(/RECOMMENDED_ACTIONS:\s*(\[[^\]]*\])\s*$/m);
  if (match && !RemoveRecommendations.includes(intent.module.toLowerCase())) {
    try {
      recommendedActions = JSON.parse(match[1]);
    } catch (err) {
      console.error("Failed to parse RECOMMENDED_ACTIONS:", match[1], err);
      recommendedActions = [];
    }
  }

  const final_cleanMessage = response_msg
    .replace(/WORKFLOW_COMPLETED:\s*(true|false)/gi, "")
    .replace(/RECOMMENDED_ACTIONS:\s*\[[^\]]*\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    module: intent.module,
    message: final_cleanMessage,
    toolmessage: report_response,
    workflowcompleted: workflowCompleted,
    actions: recommendedActions,
  };
}
