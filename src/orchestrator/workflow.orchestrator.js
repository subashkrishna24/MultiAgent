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
import { executeMailTemplateUploadFilesAgent } from "../agents/mail/uploadmailteamplate.agent.js";
import { getSession, clearPagingSession } from "../store/session.store.js";
import { handlePagination } from "../utils/pagination.helper.js";

import {
  prepareUserDetails,
  cleanReportEntry,
  cleanMergedResults,
} from "../utils/shared.helper.js";
import { getDateContext } from "../utils/datecontext.helper.js";
import { executeContactImportAgent } from "../agents/contact/contactimport.agent.js";
import { executeLeadsImportAgent } from "../agents/lms/leadsimport.agent.js";
import { executeLeadManagementAgent } from "../agents/lms/leadmanagment.agent.js";
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

  if (history.length === 1) {
    clearPagingSession(machineid);
  }
  // Session
  const session = getSession(machineid);

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
    const plannerResponse = await executeReportPlannerAgent({
      model: llmModel,
      history: recentHistory,
      accountId: accountid,
    });

    let executionPlan = {
      executionType: "single",
      datasets: [{ name: "Report" }],
    };

    console.log(plannerResponse.messages.at(-1).content);

    try {
      executionPlan = extractJSON(plannerResponse.messages.at(-1).content);
    } catch (error) {
      console.error("Failed to parse reporting planner JSON:", error);
    }
    const lastUserMessage = [...recentHistory]
      .reverse()
      .find((m) => m.role === "user");
    const reportingRequestHistory = [
      {
        role: "system",
        content: `REPORT_PLANNER: ${JSON.stringify(executionPlan)}`,
      },
      lastUserMessage,
    ];

    const reportingAgentResponse = await executeReportingAgent({
      model: llmModel,
      tools: [],
      history: reportingRequestHistory,
      accountId: accountid,
    });

    let queryPlan = { queries: [] };

    try {
      queryPlan = extractJSON(reportingAgentResponse.messages.at(-1).content);
    } catch (error) {
      console.error("Failed to parse reporting query JSON:", error);
    }

    const reportTool = allTools.find((x) => x.name === "GetReport");
    const queries = Array.isArray(queryPlan.queries) ? queryPlan.queries : [];

    if (executionPlan.executionType === "single") {
      if (queries.length > 0 && queries[0].query) {
        report_response = await reportTool.invoke({
          getquery: queries[0].query,
        });
      }

      response = reportingAgentResponse;
    } else {
      const mergedResults = [];

      for (const item of queries) {
        if (!item?.query) continue;

        const result = await reportTool.invoke({
          getquery: item.query,
        });

        mergedResults.push({
          name: item.name || "Report",
          data: result,
        });
      }

      report_response = mergedResults;
      const cleanedResults = cleanMergedResults(mergedResults);
      response = await executeReportingAnalysisAgent({
        model: llmModel,
        history: [
          {
            role: "system",
            content: `MERGED_RESULTS: ${JSON.stringify(cleanedResults, null, 2)}`,
          },
          lastUserMessage,
        ],
        accountId: accountid,
      });
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
