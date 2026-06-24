import { INTENT_PROMPT } from "../../prompts/intent/intent.prompt.js";
import { extractJSON } from "../../utils/json.utils.js";

export async function detectIntent(model, message) {
  try {
    const response = await model.invoke([
      {
        role: "system",
        content: INTENT_PROMPT
      },
      {
        role: "user",
        content: message
      }
    ]);

    // Fallback if JSON extraction returns null or undefined
    const parsedIntent = extractJSON(response.content);
    return parsedIntent || { module: "knowledge", confidence: "low" };
    
  } catch (error) {
    console.error("Error detecting intent:", error);
    // Safe fallback module to keep orchestrator moving forward safely
    return { module: "knowledge", error: true };
  }
}