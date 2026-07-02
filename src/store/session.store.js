// In-memory store
// Key = accountId
// Value = user session data

export const sessionStore = {};

/**
 * Get user session
 */
export function getSession(machineid) {
  if (!sessionStore[machineid]) {
    sessionStore[machineid] = {
      // Template Paging
      templateOffset: 0,
      templateFetchNext: 10,

      // Group Paging
      groupOffset: 0,
      groupFetchNext: 10,

      // Campaign Paging
      campaignidentifierOffset: 0,
      campaignidentifierFetchNext: 10,

      // Selected Objects
      selectedTemplate: null,
      selectedGroup: null,
      selectedCampaignIdentifier: null,

      // Workflow Data
      workflow: null,

      // upload Files
      uploadedFile: null,

      UserDetails: null,

      contactImport: null,
    };
  }

  return sessionStore[machineid];
}

/**
 * Reset Template Paging
 */
export function resetTemplatePaging(machineid) {
  const session = getSession(machineid);

  session.templateOffset = 0;
}

/**
 * Reset Group Paging
 */
export function resetGroupPaging(machineid) {
  const session = getSession(machineid);

  session.groupOffset = 0;
}

/**
 * Reset Campaign Paging
 */
export function resetCampaignPaging(machineid) {
  const session = getSession(machineid);

  session.campaignOffset = 0;
}

/**
 * Clear User Session
 */
export function clearPagingSession(machineid) {
  delete sessionStore[machineid];
}
