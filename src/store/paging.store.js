// In-memory store
// Key = accountId
// Value = user session data
export const pagingStore = {};

/**
 * Clean data blueprints for every distinct action flow
 */
const INITIAL_MODULE_STATES = {
  mailtemplate: () => ({
    FlowType: "CREATE", // "CREATE", "UPDATE", "DUPLICATE", "DELETE"
    ExistingTemplateName: "",
    TemplateName: "",
    TemplateDescription: "",
    SubjectLine: "",
    BodyContent: "",
    ViewInBrowser: null,
    CampaignIdentifier: ""
  }),
  // ==================================================
  // FIXED: Matches the exact keys utilized by upload agent
  // ==================================================
  uploadtemplate: () => ({
    TemplateName: "",
    TemplateDescription: "",
    SubjectLine: "",
    ViewInBrowser: null,
    CampaignIdentifier: "",
    uploadedFiles: []
  }),
  mailtest: () => ({
    TestEmail: "",
    TestGroupId: "",
    TemplateName: "",
    SubjectLine: ""
  }),
  mailcampaign: () => ({
    CampaignName: "",
    Template: "",
    Subject: "",
    ConfigurationName: "",
    IsPromotionalOrTransactionalType: false,
    TargetGroup: "",
    ScheduledDatetime: null,
    SenderName: "",
    SenderEmail: "",
    SpamScore: 0,
    totalcontacts: 0
  }),
  mailcampaign_abtest: () => ({
    CampaignName: "",
    CampaignType: "", // Promotional, Transactional
    IsPromotionalOrTransactionalType: "true",
    VariationA: "",
    VariationB: "",
    ScoreA: 0,
    ScoreB: 0,
    SubjectA: "",
    SubjectB: "",
    ConfigurationName: "",
    TargetGroup: "",
    ScheduledDatetime: null,
    SenderName: "",
    SenderEmail: "",
    AB_Distribution: "",
    WinningMetric: "",
    testduration: "",
    Drawcase: ""
  }),
  spamScore: () => ({
    TemplateName: "",
    SenderMail: "",
    FromName: "",
    Subject: "",
    IsPromotionalOrTransational: true,
    SpamCheckStatus: "pending",
    SpamScoreResult: null
  })
};

/**
 * Get user session with explicit dynamic boundaries
 */
export function getPagingSession(accountId) {
  if (!pagingStore[accountId]) {
    pagingStore[accountId] = {
      // Core Structural Offsets (Pagination)
      templateOffset: 0,
      templateFetchNext: 10,
      groupOffset: 0,
      groupFetchNext: 10,
      campaignidentifierOffset: 0,
      campaignidentifierFetchNext: 10,

      // Selected Runtime References
      selectedTemplate: null,
      selectedGroup: null,
      selectedCampaignIdentifier: null,
      workflow: null,
      uploadedFile: null,
      UserDetails: null,

      // ==================================================
      // CORE AGENT STATE MANAGER
      // ==================================================
      activeModule: null,               // Tracks locked flow ('mailcampaign', 'mailtest', etc.)
      isWaitingForTemplateInput: false, // Preserves turn context lock
      isWaitingForUploadInput: false,   // Upload specific turn lock toggle
      
      // Separate active form memory stores
      moduleData: {
        mailtemplate: INITIAL_MODULE_STATES.mailtemplate(),
        uploadtemplate: INITIAL_MODULE_STATES.uploadtemplate(),
        mailtest: INITIAL_MODULE_STATES.mailtest(),
        mailcampaign: INITIAL_MODULE_STATES.mailcampaign(),
        mailcampaign_abtest: INITIAL_MODULE_STATES.mailcampaign_abtest(),
        spamScore: INITIAL_MODULE_STATES.spamScore()
      }
    };
  }
  return pagingStore[accountId];
}

/**
 * Universal dynamic reset engine that flushes target workflows 
 * back to empty schema blueprints without leaking properties.
 */
function flushModuleState(session, moduleName) {
  if (INITIAL_MODULE_STATES[moduleName]) {
    session.moduleData[moduleName] = INITIAL_MODULE_STATES[moduleName]();
  }
}

/**
 * Reset Template Creation Paging & Clear Module Cache
 */
export function resetTemplatePaging(accountId) {
  const session = getPagingSession(accountId);
  session.templateOffset = 0;
  session.activeModule = null;
  session.isWaitingForTemplateInput = false;
  
  flushModuleState(session, "mailtemplate");
}

/**
 * Reset Mail Campaign Flow & Data Boundaries
 */
export function resetMailCampaignPaging(accountId) {
  const session = getPagingSession(accountId);
  session.campaignidentifierOffset = 0;
  session.selectedCampaignIdentifier = null;
  session.activeModule = null;
  session.isWaitingForTemplateInput = false;
  
  flushModuleState(session, "mailcampaign");
  flushModuleState(session, "mailcampaign_abtest"); // Clear related A/B contexts cleanly
}

/**
 * Reset Group Paging
 */
export function resetGroupPaging(accountId) {
  const session = getPagingSession(accountId);
  session.groupOffset = 0;
  session.selectedGroup = null;
  session.activeModule = null;
  session.isWaitingForTemplateInput = false;
}

/**
 * Reset Specific Actions Dynamically (mailtest, spamScore, uploadtemplate)
 */
export function resetSpecificModule(accountId, moduleName) {
  const session = getPagingSession(accountId);
  session.activeModule = null;
  session.isWaitingForTemplateInput = false;
  session.isWaitingForUploadInput = false;
  
  if (session.moduleData[moduleName]) {
    flushModuleState(session, moduleName);
  }
}

/**
 * Clear Full Session Cache
 */
export function clearPagingSession(accountId) {
  if (pagingStore[accountId]) {
    delete pagingStore[accountId];
  }
}