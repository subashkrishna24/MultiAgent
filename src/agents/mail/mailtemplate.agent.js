import { createAgent } from "../../utils/agent.factory.js";

export async function executeMailTemplateAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {

  const lastMessage = history[history.length - 1].content.toLowerCase().trim();
  
  // ==================================================
  // 1. INITIALIZE NAMESPACED TRACKING SESSION MEMORY
  // ==================================================
  if (!session.moduleData) {
    session.moduleData = {};
  }
  
  if (!session.moduleData.mailtemplate) {
    session.moduleData.mailtemplate = {
      FlowType: "CREATE", // "CREATE", "UPDATE", "DUPLICATE", "DELETE"
      ExistingTemplateName: "", 
      TemplateName: "",
      TemplateDescription: "",
      SubjectLine: "",
      BodyContent: "",
      ViewInBrowser: null,
      CampaignIdentifier: ""
    };
  }
 
  const draft = session.moduleData.mailtemplate;

  // ====================================================================
  // CRITICAL FIX: MULTI-FLOW LIFECYCLE LOCK & RESET ON SWITCH
  // ====================================================================
  let detectedFlow = draft.FlowType;

  if (/(duplicate|clone|copy)\s+mail\s+template/i.test(lastMessage)) {
    detectedFlow = "DUPLICATE";
  } else if (/(delete|remove|archive|trash)\s+mail\s+template/i.test(lastMessage)) {
    detectedFlow = "DELETE";
  } else if (/(update|edit|modify|change|patch)\s+mail\s+template/i.test(lastMessage)) {
    detectedFlow = "UPDATE";
  } else if (/(create|new|add|generate)\s+mail\s+template/i.test(lastMessage)) {
    detectedFlow = "CREATE";
  }

  // Pure flow command detection (e.g., "update mail template")
  const isPureFlowCommand = /^(update|edit|modify|duplicate|clone|copy|delete|remove)\s+mail\s+template$/i.test(lastMessage) ||
                            /^(i\s+want\s+to\s+)?(update|edit|modify|duplicate|clone|copy|delete|remove)\s+mail\s+template$/i.test(lastMessage);

  if (detectedFlow !== draft.FlowType || isPureFlowCommand) {
    draft.FlowType = detectedFlow;
    draft.ExistingTemplateName = "";
    draft.TemplateName = "";
    draft.TemplateDescription = "";
    draft.SubjectLine = "";
    draft.BodyContent = "";
    draft.ViewInBrowser = null;
    draft.CampaignIdentifier = "";
  }

  // ==================================================
  // 2. DYNAMIC STATE EXTRACTION VIA LLM
  // ==================================================
  const extractionPrompt = {
    role: "system",
    content: `Analyze the conversation log and extract values provided by the user for managing a mail template. 
    
    CRITICAL CRITERIA:
    - Extract the "ExistingTemplateName" if the user has explicitly selected or typed an existing template to update, modify, or duplicate.
    - If the user is just saying they want to update/duplicate a template generally, do NOT extract a name. Leave ExistingTemplateName empty.

    Return your response strictly as a valid, raw JSON object with no markdown formatting tags. Structure:
    {
      "ExistingTemplateName": "string or empty",
      "TemplateName": "string or empty",
      "TemplateDescription": "string or empty",
      "SubjectLine": "string or empty",
      "BodyContent": "string or empty",
      "ViewInBrowser": "Yes/No or empty",
      "CampaignIdentifier": "string or empty"
    }`
  };

  try {
    const extractionResult = await model.invoke([...history, extractionPrompt]);
    
    let cleanJsonText = extractionResult.content.trim();
    if (cleanJsonText.startsWith("```json")) cleanJsonText = cleanJsonText.replace(/```json|```/g, "").trim();
    if (cleanJsonText.startsWith("```")) cleanJsonText = cleanJsonText.replace(/```/g, "").trim();

    const parsedData = JSON.parse(cleanJsonText);
    
    if (parsedData.ExistingTemplateName) draft.ExistingTemplateName = parsedData.ExistingTemplateName;
    if (parsedData.TemplateName) draft.TemplateName = parsedData.TemplateName;
    if (parsedData.TemplateDescription) draft.TemplateDescription = parsedData.TemplateDescription;
    if (parsedData.SubjectLine) draft.SubjectLine = parsedData.SubjectLine;
    if (parsedData.BodyContent) draft.BodyContent = parsedData.BodyContent;
    if (parsedData.ViewInBrowser) draft.ViewInBrowser = parsedData.ViewInBrowser;
    if (parsedData.CampaignIdentifier) draft.CampaignIdentifier = parsedData.CampaignIdentifier;

  } catch (error) {
    console.error("[State Extraction Error]: Safely falling back to pre-existing session values.", error);
  }

  // Double-check guardrail if a user re-ran a pure initiation command
  if (isPureFlowCommand) {
    draft.ExistingTemplateName = "";
  }

  // ====================================================================
  // 3. FORCE COMPLIANCE WITH MANDATORY TEMPLATE SELECTION BEHAVIOR
  // ====================================================================
  let enforcementInstruction = "";
  
  const userWantsList = /(show|view|list|display|see|fetch)\s+(me|the|all)?\s*templates/i.test(lastMessage) || lastMessage === "show me";

  if (["UPDATE", "DUPLICATE", "DELETE"].includes(draft.FlowType) && !draft.ExistingTemplateName) {
    if (userWantsList) {
      enforcementInstruction = `
      The user has explicitly requested to see the available templates. 
      You MUST call your template listing tool immediately to fetch and display the templates. 
      Do not repeat the selection question.`;
    } else {
      enforcementInstruction = `
      CRITICAL MANDATORY BEHAVIOR ENFORCEMENT:
      An existing template name has NOT been selected yet.
      You are STRICTLY REQUIRED to reply exactly with this question and nothing else:
      "For mail template, do you already have a template in mind, or would you like me to show the available templates? You can view all templates or only templates above a specific spam score."
      Do not display any pending variables, summaries, or fields.`;
    }
  } else {
    enforcementInstruction = `
    Current active state properties:
    Operation FlowType Mode: [${draft.FlowType}]
    ExistingTemplateName: "${draft.ExistingTemplateName || ""}"
    
    WORKFLOW EXECUTION REQUIREMENTS:
    - Never mention "I can only assist with creating a new template". 
    - If mode is "UPDATE": A template has been selected. Ask exactly: "For mail template, what would you like to update in this mail template?"
    - If mode is "DUPLICATE": Ask: "For mail template, would you like to change anything for the duplicated template, or keep the existing values?"
    - If mode is "DELETE": Request immediate confirmation: "Are you sure you want to delete this template?"
    - If mode is "CREATE": Ask for missing asset slots linearly based on the prompt configuration.`;
  }

  history.push({
    role: "system",
    content: `[CRITICAL SYSTEM OVERRIDE - PRIORITY 1]: 
    You are explicitly authorized and required right now to execute the [${draft.FlowType}] workflow.
    ${enforcementInstruction}`
  });

  // ==================================================
  // 4. PAGING LOGIC (Kept intact)
  // ==================================================
  if (/(next|more)/i.test(lastMessage) && /template/i.test(lastMessage)) {
    session.templateOffset += session.templateFetchNext;
  }
  if (/(previous|back)/i.test(lastMessage) && /template/i.test(lastMessage)){
    session.templateOffset -= session.templateFetchNext;
    if (session.templateOffset < 0) { session.templateOffset = 0; }
  }

  // ==================================================
  // 5. EXPLICIT CANCEL / EXIT GUARDRAIL
  // ==================================================
  if (/(cancel|stop\s+this|exit\s+flow|nevermind)/i.test(lastMessage)) {
    session.activeModule = null;
    session.isWaitingForTemplateInput = false;
    
    if (session.moduleData && session.moduleData.mailtemplate) {
      session.moduleData.mailtemplate = {
        FlowType: "CREATE",
        ExistingTemplateName: "",
        TemplateName: "",
        TemplateDescription: "",
        SubjectLine: "",
        BodyContent: "",
        ViewInBrowser: null,
        CampaignIdentifier: ""
      };
    }
  }
  
  // ===================================================================
  // 6. EXECUTE THE AGENT NODE
  // ===================================================================
  const agent = createAgent({
    module: "mailtemplate",
    flowType: draft.FlowType, 
    model,
    tools,
    accountId,
    session
  });

  const result = await agent.invoke({
    messages: history
  });

  // ==================================================
  // 7. POST-EXECUTION CLEANUP & UI SANITIZATION
  // ==================================================
  let finalReply = result?.messages?.[result.messages.length - 1]?.content || "";
  
  finalReply = finalReply
    .replace(/WORKFLOW_COMPLETED\s*:\s*true/gi, "")
    .replace(/WORKFLOW_COMPLETED/gi, "")
    .trim();

  if (result?.messages?.[result.messages.length - 1]) {
    result.messages[result.messages.length - 1].content = finalReply;
  }
  
  if (
    finalReply.toLowerCase().includes("successfully") || 
    finalReply.toLowerCase().includes("has been created") || 
    finalReply.toLowerCase().includes("has been updated") || 
    finalReply.toLowerCase().includes("has been duplicated") || 
    finalReply.toLowerCase().includes("has been archived") ||
    finalReply.toLowerCase().includes("has been deleted")
  ) {
    session.activeModule = null;
    session.isWaitingForTemplateInput = false;
    
    if (session.moduleData && session.moduleData.mailtemplate) {
      session.moduleData.mailtemplate = {
        FlowType: "CREATE",
        ExistingTemplateName: "",
        TemplateName: "",
        TemplateDescription: "",
        SubjectLine: "",
        BodyContent: "",
        ViewInBrowser: null,
        CampaignIdentifier: ""
      };
    }
  }

  return result;
}