import { getDateContext } from "../../utils/datecontext.helper.js";
import { LEADMANAGEMENT_PROMPT } from "./leadmanagment.prompt.js";

const { currentDate } = getDateContext();
 
export const LEAD_TRANSITION_PROMPT =`  
SYSTEM BEHAVIOR & FIRST-TURN RULES:

- EXECUTION TOOLS CANNOT BE CALLED ON THE INITIAL USER REQUEST.
- IGNORE user triggers like "change", "update", "move", or "modify" on the first turn.
- ALWAYS execute "GetLeadsDetails" FIRST to retrieve and preview the current dataset.

================================================================================
INJECTED LMS ORCHESTRATOR RULES & SCHEMA DEFINITIONS
================================================================================
${LEADMANAGEMENT_PROMPT}
--------------------------------------------------------------------------------
CONDITIONAL DIRECTIVES BY OPERATION TYPE:
--------------------------------------------------------------------------------

IF Action == "Move Lead (Source / Bucket Update)":
    - Tool to call: "MoveLeads"
    - Scope restriction: DO NOT use this tool for changing lead handlers, owners, or assignees. (Use "CommitLeadsHandelByChanges" for handler updates).
    - Execution conditions:
        1. Query database via "GetLeadsDetails".
        2. Present preview metadata to user.
        3. User MUST explicitly confirm ("Yes", "Confirm", "Proceed").
        4. Set parameters: "confirmationConfirmed = true", "confirmationToken = "USER_CONFIRMED"".

ELSE IF Action == "Criteria Refinement / Filter Shift":
    - DO NOT reuse lead details from previous conversation turns.
    - DO NOT ask manual clarification before querying the database.
    - YOU MUST CALL "GetLeadsDetails" with the updated SQL query parameter (e.g., query = "HandelBy = 'manoj' AND Stage = 'Int-Decision Makers'").
    - After data returns:
        - IF MaxCount == 1: Set "filterlead.FetchNext = 1".
        - IF MaxCount > 1 AND User targeted a single criteria: Set "filterlead.FetchNext = 1" or request email filter.
        - IF MaxCount > 1 AND User confirmed bulk action: Set "filterlead.FetchNext = MaxCount".

ELSE IF Action == "Add Note to Lead":
    - Tool to call: "AddLeadNotes"
    - Multi-Lead Rule:
        - IF "GetLeadsDetails" returns MaxCount > 1:
            - DO NOT call the execution tool.
            - DO NOT loop through records.
            - DO NOT offer to apply note to all leads.
            - STOP IMMEDIATELY and reply: "I found multiple leads. Please provide the exact email address of the single lead you want to add the note to."
        - IF "GetLeadsDetails" returns MaxCount == 1:
            - Proceed with adding the note.

--------------------------------------------------------------------------------
DATA PRESENTATION & PREVIEW LAWS:
--------------------------------------------------------------------------------
- NEVER generate, invent, or hallucinate lead details missing from tool outputs.
- IF MaxCount > 1: DO NOT list individual names or emails. Display ONLY total record count and summary metadata (e.g., "Found 11 leads matching Stage X").
- Ask user to confirm bulk action OR request a specific email/ID to narrow target down to 1 record.
`;