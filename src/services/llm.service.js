import { ChatOpenAI }
  from "@langchain/openai";

import { ChatAnthropic }
  from "@langchain/anthropic";

export function getllmModel(
  models,
  apikey
) {

  if (apikey.startsWith("sk-ant-")) {

    return new ChatAnthropic({
      modelName: models,
      anthropicApiKey: apikey,
    });
  }

  return new ChatOpenAI({
    modelName: models,
    apiKey: apikey,
    temperature: 0,
    maxTokens: 1000,
  });
}