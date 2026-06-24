import { createAgent } from "../../utils/agent.factory.js";

export async function executeMailTemplateUploadFilesAgent({
  model,
  tools,
  history,
  accountId,
  session
}) { 
  const lastMessage = history[history.length - 1].content.toLowerCase().trim();

  // ==================================================
  // 1. STATE INITIALIZATION & RECOVERY (Explicit Flat Schema)
  // ==================================================
  if (!session.draftTemplate) {
    session.draftTemplate = {
      TemplateName: "",
      TemplateDescription: "",
      SubjectLine: "",         // Uniform Key shared across both agents
      ViewInBrowser: null,
      CampaignIdentifier: "",
      uploadedFiles: [] 
    };
  }

  const uploadState = session.draftTemplate;

  // ==================================================
  // 2. REVERSE VALIDATION LOOKBACK (Prevents Detour Corruptions)
  // ==================================================
  let lastAssistantQuestion = "";
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].role === "assistant") {
      lastAssistantQuestion = history[i].content.toLowerCase();
      break;
    }
  }

  if (lastAssistantQuestion) {
    const userResponseRaw = history[history.length - 1].content.trim();
    const userResponseClean = userResponseRaw.toLowerCase();

    // Direct dynamic detour bypass
    const isDetour = userResponseClean.includes("?") || 
                     /^(can|could|should|what|why|how|before|wait|hold|test|cancel|exit)/.test(userResponseClean) ||
                     /(spam score|groups|campaign details|analytics)/.test(userResponseClean);

    if (!isDetour) {
      if (lastAssistantQuestion.includes("name the template")) {
        uploadState.TemplateName = userResponseRaw;
      } else if (lastAssistantQuestion.includes("short description")) {
        uploadState.TemplateDescription = userResponseRaw;
      } else if (lastAssistantQuestion.includes("subject line")) {
        uploadState.SubjectLine = userResponseRaw; 
      } else if (lastAssistantQuestion.includes("view in browser")) {
        uploadState.ViewInBrowser = /(true|yes|y)/i.test(userResponseClean) ? "true" : "false";
      } else if (lastAssistantQuestion.includes("campaign identifier") && !userResponseClean.includes("show")) {
        uploadState.CampaignIdentifier = userResponseRaw;
      }
    }
  }

  // Intercept summary / check-in requests natively to save tokens
  if (uploadState.uploadedFiles.length > 0 && /(what did i upload|show uploaded files|check my files|upload status)/i.test(lastMessage)) {
    const fileList = uploadState.uploadedFiles.map(f => `• ${f}`).join("\n");
    return {
      messages: [{
        role: "assistant",
        content: `For template file upload, here are the files tracked in this session so far:\n\n${fileList}\n\nWould you like to proceed with processing these files, or upload more?`
      }]
    };
  }

  // ==================================================
  // CONTEXT RECOVERY SYSTEM INJECTION
  // ==================================================
  const filesFound = session.uploadedFile || [];
  history.push({
    role: "system",
    content: `[SESSION CONTEXT RECOVERY]: The upload module is active.
    Staged Files: [${filesFound.map(f => f.name || f).join(", ") || "None"}].
    Collected Form Progress:
    - CampaignIdentifier: "${uploadState.CampaignIdentifier || ""}"
    - TemplateName: "${uploadState.TemplateName || ""}"
    - TemplateDescription: "${uploadState.TemplateDescription || ""}"
    - SubjectLine: "${uploadState.SubjectLine || ""}"
    - ViewInBrowser: "${uploadState.ViewInBrowser || ""}"
    
    If the user asks for status, a summary, or a side question, use this data to respond naturally.`
  });

  // ==================================================
  // 3. PAGING LOGIC (Kept intact)
  // ==================================================
  if (/(next|more)/i.test(lastMessage) && /template/i.test(lastMessage)) {
    session.templateOffset += session.templateFetchNext;
  }
  if (/(previous|back)/i.test(lastMessage) && /template/i.test(lastMessage)){
    session.templateOffset -= session.templateFetchNext;
    if (session.templateOffset < 0) { session.templateOffset = 0; }
  }

  // ==================================================
  // 4. EXPLICIT CANCEL / EXIT GUARDRAIL
  // ==================================================
  if (/(cancel|stop\s+this|exit\s+flow|nevermind|abort)/i.test(lastMessage)) {
    session.activeModule = null;
    session.isWaitingForTemplateInput = false; 
    session.isWaitingForUploadInput = false; 
    session.draftTemplate = null; 
  }

  // Construct and execute the agent node
  const agent = createAgent({
    module: "mailtemplateuploadfiles",
    model,
    tools,
    accountId,
    session
  });

  const result = await agent.invoke({
    messages: history
  });

  // ==================================================
  // 5. POST-EXECUTION CLEANUP & SUCCESS LOCK-RELEASE
  // ==================================================
  const finalReply = result?.messages?.[result.messages.length - 1]?.content || "";

  if (/(uploaded successfully|processed successfully|files attached|created successfully)/i.test(finalReply.toLowerCase())) {
    uploadState.status = "completed";
    
    session.activeModule = null;
    session.isWaitingForTemplateInput = false; 
    session.isWaitingForUploadInput = false; 
    session.draftTemplate = null; 
  }

  return result;
}