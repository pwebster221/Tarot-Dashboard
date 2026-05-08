import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function explore(url) {
  console.log(`\nExploring ${url}...`);
  try {
    const transport = new SSEClientTransport(new URL(`${url}`));
    const client = new Client({
      name: "arcanum-explorer",
      version: "1.0.0",
    }, {
      capabilities: {}
    });

    await client.connect(transport);
    const tools = await client.listTools();
    console.log(`Tools available on ${url}:`);
    for (const tool of tools.tools) {
      console.log(`- ${tool.name}: ${tool.description}`);
      console.log(`  Schema:`, JSON.stringify(tool.inputSchema));
    }
  } catch (err) {
    console.error(`Error exploring ${url}:`, err.message);
  }
}

async function main() {
  await explore("https://mani.dubtown-server.us/mcp");
  await explore("https://kaimcp.dubtown-server.us/mcp");
  await explore("https://neo4j.dubtown-server.us/mcp");
  process.exit(0);
}

main();
