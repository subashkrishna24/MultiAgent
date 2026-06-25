// In-memory store
// Key = accountId
// Value = user session data

export const sessionStore = {};

/**
 * Get user session
 */
export function getSession(accountId) {
  if (!sessionStore[accountId]) {
    sessionStore[accountId] = {
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
    };
  }

  return sessionStore[accountId];
}

/**
 * Reset Template Paging
 */
export function resetTemplatePaging(accountId) {
  const session = getSession(accountId);

  session.templateOffset = 0;
}

/**
 * Reset Group Paging
 */
export function resetGroupPaging(accountId) {
  const session = getSession(accountId);

  session.groupOffset = 0;
}

/**
 * Reset Campaign Paging
 */
export function resetCampaignPaging(accountId) {
  const session = getSession(accountId);

  session.campaignOffset = 0;
}

/**
 * Clear User Session
 */
export function clearPagingSession(accountId) {
  delete sessionStore[accountId];
}