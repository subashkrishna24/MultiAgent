import {
  INTENT_PROMPT
} from "../../prompts/intent/intent.prompt.js";
import { extractJSON } from "../../utils/json.utils.js";

export async function detectIntent(
  model,
  message
) {

  const response =
    await model.invoke([

      {
        role: "system",
        content: INTENT_PROMPT
      },

      {
        role: "user",
        content: message
      }
    ]);
return extractJSON(response.content);
}