import { createAgent } from "../../utils/agent.factory.js";

export async function executeSendSmsToLeadAgent({ model, tools, history, accountId, session }) {

    const agent = createAgent({ module: "sendsmstolead", model, tools, accountId, session });

    return await agent.invoke({ messages: history });
}