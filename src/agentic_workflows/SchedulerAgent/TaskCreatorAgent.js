import { getllmModel } from "../../services/llm.service.js";
import { userdetails } from "../prompts/userdetails.js";
import { extractJSON } from "../../utils/json.utils.js";

export async function createTaskFromUserQuery(
  userQuery,
  llmModel,
  userId = "123",
) {
  const prompt = userdetails
    .replace("<user-id>", userId)
    .replaceAll("<current-time>", new Date().toISOString());

  const res = await llmModel.invoke([
    { role: "system", content: prompt },
    { role: "user", content: userQuery },
  ]);

  const raw =
    typeof res.content === "string"
      ? res.content
      : (res.content?.[0]?.text ?? "");

  try {
    return extractJSON(raw);
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("Task Creator returned invalid JSON");
    }
  }
}
