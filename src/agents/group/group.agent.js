import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeGroupAgent({
  model,
  tools,
  history,
  accountId
}) {

  const agent = createAgent({
    module: "group",
    model,
    tools,
    accountId,
    session
  });

  const lastMessage =history[history.length - 1].content.toLowerCase().trim();
  // Next Page
  if (/(next|more)/i.test(lastMessage) &&  /group/i.test(lastMessage)) {
    session.groupOffset +=session.groupFetchNext;
  }
  // Previous Page
  if (/(previous|back)/i.test(lastMessage) &&  /group/i.test(lastMessage)){
    session.groupOffset -=session.groupFetchNext;
    if (session.groupOffset < 0) {session.groupOffset = 0;}
  }

  return await agent.invoke({
    messages: history
  });
}