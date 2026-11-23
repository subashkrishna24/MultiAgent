// Workflow contacts via GetReport. MCP, the LLM and the workflow agent are mocked.
// Run: node --test --experimental-test-module-mocks test/
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const WF = {
  flowchartConfig: {
    nodes: [
      { blockId: "state_segment_1000", positionX: 450, positionY: 80, label: "Audience" },
      { blockId: "state_mail_2000", positionX: 450, positionY: 210, label: "Send Mail" },
    ],
    connections: [
      { connectionId: "con_1", SourceId: "state_segment_1000", TargetId: "state_mail_2000", anchor: "Bottom3", RelationWithParent: "Satisfy" },
    ],
    numberOfElements: 2,
  },
  configarray: [
    { Channel: "state_segment_1000", Value: "contacts from Bangalore", Title: "group" },
    { Channel: "state_mail_2000", Value: "Welcome", Title: "mail" },
  ],
  name: "Bangalore Welcome Mail",
  description: "",
  steps: [
    {
      id: "step1", name: "Send Mail Welcome for contacts from Bangalore", order: 1, type: "action", dependsOn: "step0",
      action: { module: "reporting", args: { channel: "mail", getquery: "contacts from Bangalore", type: 0, isworkflow: true, agentworkflowid: "{{agentworkflowid}}", agenttaskid: "step1", templatename: "Welcome", taskrepeatedvalues: false } },
    },
  ],
};
const DRAFT = `${JSON.stringify(WF)}\nSummary of 'Bangalore Welcome Mail':\n1. Send Mail to contacts from Bangalore - template Welcome\nWould you like me to save this workflow 'Bangalore Welcome Mail'?`;

const ROWS = [
  { ContactId: 1, Name: "Asha", EmailId: "asha@x.com" },
  { ContactId: 2, Name: "Ravi", EmailId: "ravi@x.com" },
  { ContactId: 3, Name: "Meena", EmailId: "meena@x.com" },
];
const calls = { report: [], save: [], opened: 0, closed: 0 };
const tools = [
  {
    name: "GetReport",
    invoke: async (args) => {
      calls.report.push(args);
      if (/Test_Surekha_15_sptt/.test(args.getquery)) {
        // the exact reply from the real GetReport (text answer, number inside the group name)
        return '{"sucess":true,"dbdata":"\\"**Total contacts in the group \\\\\\"Test_Surekha_15_sptt\\\\\\": 1.**\\"","Message":"SELECT g.name AS groupname, COUNT(DISTINCT gm.contactid) AS total_contacts FROM groups g INNER JOIN groupmember gm ON gm.groupid = g.id WHERE g.name ILIKE \'%Test_Surekha_15_sptt%\' GROUP BY g.id, g.name ORDER BY g.name;"}';
      }
      if (/how many/i.test(args.getquery)) {
        // a count question: GetReport answers with one count row
        return JSON.stringify({ success: true, Message: "SELECT COUNT(*) AS NumberOfContacts FROM contact", dbdata: JSON.stringify([{ NumberOfContacts: 5230 }]) });
      }
      return JSON.stringify({ success: true, Message: "SELECT ContactId, Name, EmailId FROM contact WHERE City = 'Bangalore'", dbdata: JSON.stringify(ROWS) });
    },
  },
  { name: "SaveAgentWorkFlow", invoke: async (a) => { calls.save.push(a); return JSON.stringify({ Status: true, Id: 77 }); } },
];

mock.module("../services/mcp.service.js", {
  namedExports: {
    getMcpClient: () => { calls.opened++; return { getTools: async () => tools, close: async () => { calls.closed++; } }; },
  },
});
const rewrites = [];
mock.module("../services/llm.service.js", {
  namedExports: {
    getllmModel: () => ({
      invoke: async (msgs) => {
        const system = String(msgs?.[0]?.content ?? "");
        if (system.includes("standalone question")) {
          const input = String(msgs[1].content);
          rewrites.push(input);
          // what the model does: resolve "the group" from what the user said earlier
          if (/Test_Surekha_15_sptt/.test(input) && /LATEST MESSAGE:\nhow many contacts are there in the group/.test(input)) {
            return { content: "How many contacts are in the group Test_Surekha_15_sptt?" };
          }
          return { content: input.split("LATEST MESSAGE:\n")[1] };
        }
        return { content: '{"module":"reporting","confidence":"high"}' };
      },
    }),
  },
});
mock.module("../agentic_workflows/agent/workflow.agent.js", {
  namedExports: { executeWorkFlowAgent: async () => ({ messages: [{ content: DRAFT }] }) },
});

const { executeWorkflow } = await import("../orchestrator/workflow.orchestrator.js");
const { isContactCountQuestion, isContactDetailsRequest, buildContactsQuestion } = await import("../agentic_workflows/agent/workflow-contacts.js");

const base = { accountid: 4, apikey: "k", model: "m", p5apikey: "p5", machineid: "M1", isagentworkflow: true, actiontype: "create", userdetails: {} };
const user = (content) => ({ role: "user", content });
const bot = (content) => ({ role: "assistant", content });

test("draft: GetReport runs with the audience text, ONLY the count is shown", async () => {
  const r = await executeWorkflow({ ...base, history: [user("send Welcome mail to contacts from Bangalore")] });
  assert.equal(calls.report.at(-1).getquery, "contacts from Bangalore", "the audience content is passed as it is");
  assert.equal(calls.report.at(-1).type, 1);
  assert.equal(r.toolmessage.contactcount, 3);
  assert.equal(r.toolmessage.dbdata, undefined, "no contact details by default");
  const lines = r.message.trim().split("\n");
  assert.equal(lines.at(-2), "Total count: 3");
  assert.match(lines.at(-1), /^Would you like me to save/);
});

test("'how many contacts?' -> count only", async () => {
  const before = calls.report.length;
  const r = await executeWorkflow({ ...base, history: [user("x"), bot(DRAFT), user("how many contacts will get this?")] });
  assert.equal(calls.report.length, before + 1, "fresh count");
  assert.equal(r.message, "Total count: 3");
  assert.equal(r.toolmessage.contactcount, 3);
  assert.equal(r.toolmessage.dbdata, undefined);
});

test("'show the contact details' -> count + details table (reporting shape)", async () => {
  const r = await executeWorkflow({ ...base, history: [user("x"), bot(DRAFT), user("show the contact details")] });
  assert.equal(r.module, "workflow");
  assert.equal(r.message, "Total count: 3");
  assert.deepEqual(JSON.parse(r.toolmessage.dbdata), ROWS);
  assert.match(r.toolmessage.query, /^SELECT/);
});

test("save: the count is added to the saved message", async () => {
  const r = await executeWorkflow({ ...base, history: [user("x"), bot(DRAFT), user("yes")] });
  assert.equal(calls.save.length, 1);
  assert.match(r.message, /\nTotal count: 3$/);
});

test("reporting module still works the same (shared helper)", async () => {
  const r = await executeWorkflow({ ...base, isagentworkflow: false, machineid: "M2", history: [user("show contacts from Bangalore")] });
  assert.equal(r.module, "reporting");
  assert.equal(r.message, "Here is your report.");
  assert.deepEqual(JSON.parse(r.toolmessage.dbdata), ROWS);
});

// the two messages from the screenshot, in a chat with no workflow yet
test("no workflow: 'show me how many are there' -> GetReport, Total count", async () => {
  const r = await executeWorkflow({ ...base, machineid: "S1", history: [user("show me how many are there")] });
  assert.equal(calls.report.at(-1).getquery, "How many contacts are there?");
  assert.equal(r.message, "Total count: 5,230");
  assert.equal(r.toolmessage.dbdata, undefined);
});

test("no workflow: 'show me how many contacts are there' -> passed as it is", async () => {
  const r = await executeWorkflow({ ...base, machineid: "S1", history: [user("show me how many are there"), bot("Total count: 5,230"), user("show me how many contacts are there")] });
  assert.equal(calls.report.at(-1).getquery, "show me how many contacts are there");
  assert.equal(r.message, "Total count: 5,230");
});

test("screenshot chat: 'how many contacts are there in the group' -> the group named earlier", async () => {
  const history = [
    user("get the users from banglore"),
    bot("Which group or audience should I use?"),
    user("set this as audience"),
    bot("To proceed, please specify what action you would like to take with the audience from Bangalore."),
    user("Test_Surekha_15_sptt thi as audience"),
    bot('It seems like you want to set "Test_Surekha_15_sptt" as the audience from Bangalore.'),
    user("how many contacts are there in the group"),
  ];
  const r = await executeWorkflow({ ...base, machineid: "S2", history });
  assert.match(rewrites.at(-1), /USER: Test_Surekha_15_sptt thi as audience/, "the conversation is given to the model");
  assert.equal(calls.report.at(-1).getquery, "How many contacts are in the group Test_Surekha_15_sptt?");
  assert.equal(r.message, "Total count: 1", "the 15 in the group name is not the count");
});

test("with a workflow: 'how many are there?' counts the workflow audience", async () => {
  const r = await executeWorkflow({ ...base, history: [user("x"), bot(DRAFT), user("how many are there?")] });
  assert.equal(calls.report.at(-1).getquery, "contacts from Bangalore");
  assert.equal(r.message, "Total count: 3");
});

test("every MCP connection that was opened is closed", () => {
  assert.equal(calls.closed, calls.opened);
});

test("request detection: count vs details", () => {
  for (const q of ["show me how many are there", "how many are there?", "how many?", "how many contacts?", "how many contacts will get this mail", "contact count", "total contacts", "show the contact count", "what is the count?", "number of contacts"]) {
    assert.equal(isContactCountQuestion(q), true, "count: " + q);
    assert.equal(isContactDetailsRequest(q), false, "not details: " + q);
  }
  for (const q of ["show the contacts", "show contacts", "list the audience", "contact details", "show me the details", "who will get this mail", "can you show the contacts", "details of the contacts", "show the contact list"])
    assert.equal(isContactDetailsRequest(q), true, "details: " + q);
  for (const q of ["get the users from banglore", "fetch contacts from Pune", "send a mail to contacts from Pune", "add sms to contacts who open", "yes", "save as draft", "how many steps are there", "how many days should it wait"]) {
    assert.equal(isContactCountQuestion(q), false, q);
    assert.equal(isContactDetailsRequest(q), false, q);
  }
  assert.equal(buildContactsQuestion("contacts from Pune"), "contacts from Pune");
  assert.equal(buildContactsQuestion("from Pune with age above 30"), "Show contacts from Pune with age above 30");
});
