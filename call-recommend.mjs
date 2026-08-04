// 临时：调 recommend_routes 生成一条酒吧约会路线，跑完即删。
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["--env-file=.env", "--import", "tsx", "server/mcp/server.ts"],
  cwd: "D:/citysense/citysense/CitySense",
});

const client = new Client({ name: "citysense-call", version: "0.0.0" }, { capabilities: {} });
await client.connect(transport);

const args = {
  city: "上海",
  interests: ["书店", "独立书店", "书吧"],
  mood: "quiet",
  timeWindow: "tonight",
};

console.log(">>> recommend_routes %s", JSON.stringify(args));
const t0 = Date.now();
const r = await client.callTool({ name: "recommend_routes", arguments: args });
console.log("<<< %dms  isError=%s", Date.now() - t0, r.isError === true);

const text = r.content?.[0]?.text ?? "(no content)";
let parsed;
try { parsed = JSON.parse(text); } catch { parsed = text; }
console.log(JSON.stringify(parsed, null, 2));

await client.close();
process.exit(0);
