// End-to-end test: spawns the MCP server exactly like Claude Code/Desktop will,
// then calls each of the 7 tools in sequence against the real .env (Supabase + AMap).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const PASS = "✓";
const FAIL = "✗";
const results = [];

function trunc(s, n = 140) {
  const one = String(s).replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}

async function call(client, name, args) {
  return client.callTool({ name, arguments: args });
}

const transport = new StdioClientTransport({
  command: "node",
  args: ["--env-file=.env", "--import", "tsx", "server/mcp/server.ts"]
});
const client = new Client({ name: "mcp-e2e", version: "0.0.0" });
await client.connect(transport);
console.log("server connected via stdio\n");

// 1. tools/list
{
  const { tools } = await client.listTools();
  const ok = tools.length === 7;
  results.push([ok, "tools/list", `${tools.length} tools: ${tools.map(t=>t.name).join(", ")}`]);
}

// 2. list_sources (no DB needed)
{
  const r = await call(client, "list_sources", {});
  const p = JSON.parse(r.content[0].text);
  const ok = !r.isError && Array.isArray(p.sources) && p.count >= 1;
  results.push([ok, "list_sources", `count=${p.count}, e.g. ${p.sources.slice(0,2).map(s=>s.source+"/"+s.status).join(", ")}`]);
}

// 3. get_city_pulse
{
  const r = await call(client, "get_city_pulse", { city: "上海" });
  const p = JSON.parse(r.content[0].text);
  const ok = !r.isError && Array.isArray(p.topTags);
  results.push([ok, "get_city_pulse", `topTags=${p.topTags?.length ?? 0}, sourceMix=${p.sourceMix?.length ?? 0}, trafficSnapshots=${p.trafficCache?.snapshotCount ?? 0}`]);
}

// 4. get_ingest_status
{
  const r = await call(client, "get_ingest_status", {});
  const p = JSON.parse(r.content[0].text);
  const ok = !r.isError && Array.isArray(p.connectors) && Array.isArray(p.recentRuns);
  results.push([ok, "get_ingest_status", `connectors=${p.connectors?.length ?? 0}, recentRuns=${p.recentRuns?.length ?? 0}, queue.configured=${p.queue?.configured}`]);
}

// 5. recommend_routes (writes snapshot, needs DB)
let routeId = null;
{
  const r = await call(client, "recommend_routes", {
    city: "上海",
    area: "徐汇",
    interests: ["咖啡", "展览"],
    mood: "quiet",
    timeWindow: "tonight"
  });
  const p = JSON.parse(r.content[0].text);
  const ok = !r.isError && Array.isArray(p.routes) && p.routes.length > 0;
  if (ok) routeId = p.routes[0].id;
  const first = p.routes?.[0];
  results.push([ok, "recommend_routes", `routes=${p.routes?.length ?? 0}, provider=${p.meta?.trafficProvider}, candidateCount=${p.meta?.candidateCount}, first="${first?.title}" (${first?.places?.length} places)`]);
}

// 6. get_route_detail (depends on 5's output)
{
  if (!routeId) {
    results.push([false, "get_route_detail", "skipped — no routeId from recommend_routes"]);
  } else {
    const r = await call(client, "get_route_detail", { routeId });
    const p = JSON.parse(r.content[0].text);
    const ok = !r.isError && p.route && p.map;
    results.push([ok, "get_route_detail", `route="${p.route?.title}", markers=${p.map?.markers?.length ?? 0}, polyline pts=${p.map?.polyline?.length ?? 0}`]);
  }
}

// 7. resolve_traffic (AMap key present)
{
  const r = await call(client, "resolve_traffic", {
    origin: { lat: 31.196, lng: 121.437 },      // 徐家汇
    destination: { lat: 31.2237, lng: 121.4553 }, // 人民广场
    mode: "driving",
    city: "上海"
  });
  const p = JSON.parse(r.content[0].text);
  const ok = !r.isError && typeof p.estimatedDurationMinutes === "number";
  results.push([ok, "resolve_traffic", `${p.estimatedDurationMinutes}min, ${p.distanceMeters ?? "?"}m, provider=${p.provider}, congestion=${p.congestion ?? "?"}`]);
}

// 8. record_feedback (validates against the snapshot from 5)
{
  if (!routeId) {
    results.push([false, "record_feedback", "skipped — no routeId"]);
  } else {
    const recId = routeId.split("__")[0];
    const r = await call(client, "record_feedback", {
      recommendationLogId: recId,
      routeId,
      value: "up"
    });
    const p = JSON.parse(r.content[0].text);
    const ok = !r.isError && p.ok === true;
    results.push([ok, "record_feedback", `ok=${p.ok}, value=up`]);
  }
}

// 9. input validation: bad mood should be rejected
{
  const r = await call(client, "recommend_routes", {
    city: "上海",
    mood: "not-real"
  });
  const ok = r.isError === true;
  results.push([ok, "recommend_routes (validation)", "bad mood rejected with isError=true"]);
}

await client.close();

console.log("\n" + "─".repeat(70));
let passed = 0;
for (const [ok, name, detail] of results) {
  console.log(`${ok ? PASS : FAIL} ${name.padEnd(32)} ${trunc(detail)}`);
  if (ok) passed += 1;
}
console.log("─".repeat(70));
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
