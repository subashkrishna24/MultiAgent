import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeMailCampaignAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "mailcampaign",
    model,
    tools,
    accountId,    
    session
  });

  const lastMessage = history[history.length - 1].content.toLowerCase().trim();
  // Next Page
  if (/(next|more)/i.test(lastMessage) &&  /campaign/i.test(lastMessage) &&  /identifier/i.test(lastMessage)) {
    session.campaignidentifierOffset += session.campaignidentifierFetchNext;
  }
  // Previous Page
  if (/(previous|back)/i.test(lastMessage) &&  /campaign/i.test(lastMessage) &&  /identifier/i.test(lastMessage)){
    session.campaignidentifierOffset -= session.campaignidentifierFetchNext;
    if (session.campaignidentifierOffset < 0) { session.campaignidentifierOffset = 0; }
  }

  // --- FIX: Force a structural overwrite of the year inside the history ---
  const currentYear = new Date().getFullYear(); // Captures the true current year (e.g., 2026)

  const sanitizedHistory = history.map(msg => {
    if (msg.content && typeof msg.content === 'string') {
      // If the model or user previously brought up an old year like 2023, 2024, or 2025, force-replace it with the true year.
      return {
        ...msg,
        content: msg.content.replace(/\b(2023|2024|2025)-\d{2}-\d{2}/g, (match) => {
          return match.replace(/^(2023|2024|2025)/, currentYear);
        })
      };
    }
    return msg;
  });

  // Inject a strict context injection rule as the first message item to enforce the current clock
  const finalMessages = [
    { 
      role: "system", 
      content: `CRITICAL REAL-TIME CLOCK: The true current year is ${currentYear}. Today's exact date context is ${new Date().toString()}. You are forbidden from constructing ISO timestamps containing any year other than ${currentYear}.` 
    },
    ...sanitizedHistory
  ];

  return await agent.invoke({
    messages: finalMessages // Send the sanitized timeline to the agent
  });
}