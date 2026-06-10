export const PAGINATION_PROMPT = `

LIST PAGINATION BEHAVIOR:

1. Display items in pages of 10 items only.

2. Never fetch or display all items at once.

3. For an initial list request:
   - Fetch and display only the first page using limit=10, offset=0.

4. Pagination State Tracking (PER MODULE):
   - Each module (Templates, Campaigns, Forms, Contacts, Groups, etc.) maintains its OWN independent pagination state.
   - Pagination state is tracked as: { module, currentOffset, limit: 10 }
   - Example: Templates may be at offset=20 while Campaigns is at offset=0.

5. Offset Calculation:
   - Page 1 → offset=0,  limit=10  (items 1–10)
   - Page 2 → offset=10, limit=10  (items 11–20)
   - Page 3 → offset=20, limit=10  (items 21–30)
   - Page 4 → offset=30, limit=10  (items 31–40)
   - Page 5 → offset=40, limit=10  (items 41–50)
   - Each "next" action increments the offset by 10 for that module only.

6. Pagination Intent Rules ("continue pagination" — fetch next page in CURRENT module):
   - "next"
   - "next items"
   - "next 10"
   - "show next 10 items"
   - "show next 10 [module name]"
   - "show more"
   - "continue"
   - "more"
   - "see more"
   - Similar pagination requests
   → Action: newOffset = currentOffset + 10 (for the active module), fetch with limit=10, offset=newOffset.

7. New List Intent Rules ("start over" — reset pagination for that module):
   - "show templates" / "list templates"
   - "show campaigns" / "list campaigns"
   - "show forms" / "list forms"
   - "show groups" / "list groups"
   - "show contacts" / "list contacts"
   - "show first 10 items"
   - "show first page"
   - "start over" / "restart"
   - Similar requests asking to view the list from the beginning
   → Action: Reset offset=0 for that module, fetch with limit=10, offset=0.

8. Module Switch Behavior:
   - If the user switches to a different module, use THAT module's last known offset.
   - If that module has never been fetched, start at offset=0.
   - Do NOT carry over the offset from a different module.
   - Example: User is on Templates at offset=20, then asks "show campaigns" → fetch Campaigns at offset=0.

9. Fetching Rules:
   - Always pass explicit limit=10 and offset=<currentOffset> in every fetch call.
   - Never omit offset — always include it, even when offset=0.
   - After a successful fetch, update and store the module's currentOffset to the offset just used.

10. Never Assume Pagination State:
    - Always derive offset from the current conversation context or tool response metadata.
    - If pagination state is unclear, default to offset=0 for that module.

11. After Displaying Results:
    - If more items are available (i.e., the returned count equals the limit):
      → End with: "Would you like to see the next 10 items?"
    - If no more items are available (returned count is less than the limit):
      → End with: "There are no additional items available."

12. Once the user selects an item from the list:
    - Proceed with the requested action on that item.
    - Stop pagination for that module.

13. This behavior applies to ALL paginated resources:
    - Email Templates, Campaigns, Forms, Contacts, Groups,
      Segments, Audiences, Assets, and any other list-based resource.
`;
