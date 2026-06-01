import { MultiServerMCPClient } from "@langchain/mcp-adapters";

export function getMcpClient(accountid, p5apikey) {
  return new MultiServerMCPClient({
    throwOnLoadError: false,

    mcpServers: {
      plumb5mcp: {
        transport: "sse",

        // url: "https://mcp.plumb5.in/sse",
        url: "http://localhost:5010/sse",

        headers: {
          P5APIKEY: p5apikey.toString(),

          P5AccountId: accountid.toString(),
        },
      },
    },
  });
}
