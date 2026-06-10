export const SHARED_PROMPT = `PAGINATION RULES

The SESSION may contain:

templateOffset
templateFetchNext
groupOffset
groupFetchNext
campaignOffset
campaignFetchNext

Use these values when fetching the next or previous page of results.

If the user says:
- next
- more
- show next

continue from the current offset.

If the user says:
- previous
- back
- show previous

use the previous offset.

Do not expose offset values to users.`;