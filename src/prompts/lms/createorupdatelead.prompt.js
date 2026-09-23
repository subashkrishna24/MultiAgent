export const CREATEORUPDATELEAD_PROMPT = `Creates a new lead or updates existing lead attributes using either Email ID or Phone Number as the primary identifier. 
================================================================================
PREREQUISITE CHECK: MANDATORY SOURCE FIELD
================================================================================
- Before proceeding with any Create or Update workflow:
    1. Check if the root 'source' parameter (e.g., 'Website', 'Manual', 'Campaign') is provided by the user.
    3. IF 'source' IS MISSING: 
        - STOP immediately. DO NOT present the confirmation preview or call this tool.
        - Ask the user: "Please provide the source/origin of the lead (e.g., 'Website', 'Manual', 'Campaign') to proceed. Shall I show the available lead source details?"
================================================================================
PARAMETER MAPPING RULES
================================================================================
1. IDENTIFIERS: Require at least ONE primary identifier ('emailId' OR 'phonenumber').
2. ROOT SOURCE: Pass the lead's originating source into the mandatory 'source'  tool parameter.
3. FIELD UPDATES (OBJECT): EVERY field change or update requested by the user MUST be mapped inside the 'fieldUpdates' key-value object (including cases where the user wants to update the source value itself, e.g., fieldUpdates: {"Source": "manual lads", "Field11": "asdsdssdsad"}). 
================================================================================
CONFIRMATION & PREVIEW WORKFLOW (MANDATORY FOR ALL ACTIONS)
================================================================================
- YOU ARE STRICTLY FORBIDDEN FROM CALLING THIS TOOL WITHOUT EXPLICIT USER CONFIRMATION.
- Preview structure must reflect the payload structure:

    "Please confirm the following details for action: [CREATE / UPDATE]
    - Identifier (Phone/Email): [phonenumber or emailId]
    - Lead Source Context: [source]
    - Other Field Details (OtherFieldsDetails object):
        - [FieldName 1]: '[Value 1]'
        - [FieldName 2]: '[Value 2]'" 
- STOP and wait for explicit user confirmation ("Yes", "Confirm", "Proceed") before making the tool call. 
================================================================================
RESET & PARAMETER CHANGE LAW
================================================================================
- IF the user modifies any field, identifier, or source parameter, OR IF execution fails:
    --> Display a fresh, updated confirmation preview with the new details.
    --> Wait for a new explicit confirmation ("Yes" / "Confirm") before attempting to call the tool again.
- This reset rule applies infinitely ($N$ times).
`;