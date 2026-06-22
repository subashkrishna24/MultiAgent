import {
  createAgent
} from "../../utils/agent.factory.js";

export async function executeMailTemplateUploadFilesAgent({
  model,
  tools,
  history,
  accountId,
  session
}) {

  const agent = createAgent({
    module: "mailtemplateuploadfiles",
    model,
    tools,
    accountId,
    session
  });

  const lastMessage =history[history.length - 1].content.toLowerCase().trim();
  // Next Page
  if (/(next|more)/i.test(lastMessage) &&  /template/i.test(lastMessage)) {
    session.templateOffset +=session.templateFetchNext;
  }
  // Previous Page
  if (/(previous|back)/i.test(lastMessage) &&  /template/i.test(lastMessage)){
    session.templateOffset -=session.templateFetchNext;
    if (session.templateOffset < 0) {session.templateOffset = 0;}
  }
  
  return await agent.invoke({
    messages: history
  });
}