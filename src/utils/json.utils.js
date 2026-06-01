export function extractJSON(text) {
  if (!text) return null;

  // Remove markdown code fences
  let cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  // Extract first JSON block
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON found in LLM output");
  }

  cleaned = cleaned.substring(firstBrace, lastBrace + 1);

  return JSON.parse(cleaned);
}
