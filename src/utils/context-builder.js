export function buildIntentContext(history) {

  const recentMessages = history
    .slice(-6) // last 6 messages
    .map(x => `${x.role}: ${x.content}`)
    .join("\n");

  return recentMessages;
}