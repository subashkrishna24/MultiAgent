import { createAgent } from "../../utils/agent.factory.js";

export async function executeSendRcsToLeadAgent({ model, tools, history, accountId, session }) {

    const agent = createAgent({ module: "sendrcstolead", model, tools, accountId, session });

    return await agent.invoke({ messages: history });
}