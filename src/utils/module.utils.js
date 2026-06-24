// Define the module prefix object at the top of the file
const MODULE_PREFIX = {
  knowledge: null,
  reporting: null,
  contact: "For contact",
  group: "For group",
  mailcampaign: "For mail campaign",
  mailtemplate: "For mail template",
  mailtemplateuploadfiles: "For upload mail template",
  captureform: "For capture form",
  mailspamscore: "For mail spam score",
  mailtest: "For mail test",
  mailcampaign_abtest: "For mail campaign"
};

/**
 * Strips away old message history from other modules 
 * to keep the context clean for the current active module flow.
 */
export function getModuleScopedHistory(history, module) {
  const prefix = MODULE_PREFIX[module];

  if (!prefix) {
    return history.slice(-12);
  }

  let startIndex = -1;

  // Scan backward from the most recent message
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]?.content || "";

    if (history[i]?.role === "assistant") {
      if (msg.includes(prefix)) {
        // Track the earliest message of the current continuous block
        startIndex = i;
      } else {
        // We hit an assistant message with a DIFFERENT prefix (e.g., "For group").
        // Stop going backward so we don't bleed into previous sessions.
        if (startIndex !== -1) {
          break;
        }
      }
    }
  }

  if (startIndex === -1) {
    return history.slice(-8);
  }

  return history.slice(startIndex);
}