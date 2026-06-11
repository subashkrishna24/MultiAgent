// In-memory store
// Key = accountId
// Value = user session data

export const pagingStore = {};

/**
 * Get user session
 */
export function getPagingSession(accountId) {

    if (!pagingStore[accountId]) {

        pagingStore[accountId] = {

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
            workflow: null
        };
    }

    return pagingStore[accountId];
}

/**
 * Reset Template Paging
 */
export function resetTemplatePaging(accountId) {

    const session =
        getPagingSession(accountId);

    session.templateOffset = 0;
}

/**
 * Reset Group Paging
 */
export function resetGroupPaging(accountId) {

    const session =
        getPagingSession(accountId);

    session.groupOffset = 0;
}

/**
 * Reset Campaign Paging
 */
export function resetCampaignPaging(accountId) {

    const session =
        getPagingSession(accountId);

    session.campaignOffset = 0;
}

/**
 * Clear User Session
 */
export function clearPagingSession(accountId) {

    delete pagingStore[accountId];
}