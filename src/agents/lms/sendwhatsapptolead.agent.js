import { createAgent } from "../../utils/agent.factory.js";

export async function executeSendWhatsappToLeadAgent({ model, tools, history, accountId, session }) {

    const agent = createAgent({ module: "sendwhatsapptolead", model, tools, accountId, session });

    return await agent.invoke({ messages: history });
}