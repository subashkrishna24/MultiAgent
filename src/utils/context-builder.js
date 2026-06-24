export function buildIntentContext(history) {

  const recentMessages = history
    .slice(-50) // last 6 messages
    .map(x => `${x.role}: ${x.content}`)
    .join("\n");

  return recentMessages;
}