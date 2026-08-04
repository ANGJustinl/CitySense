/**
 * Global MCP launcher for citysense.
 *
 * Problem: the server uses `@/*` path aliases (tsconfig `paths`), and tsx
 * resolves those relative to the project root — which it locates via the
 * process cwd. Claude Code's *global* mcpServers config launches the process
 * from an arbitrary cwd (whatever folder you started `claude` in), so a bare
 * `node --import tsx server.ts` fails with `Cannot find module '@/...'` when
 * invoked from any unrelated directory.
 *
 * Fix: this wrapper chdir()'s into the project root BEFORE importing tsx and
 * the server entry. After chdir, tsx finds tsconfig.json and `@/*` resolves
 * correctly, regardless of where Claude Code was launched. All paths are
 * absolute so nothing else depends on the original cwd.
 *
 * Wired into the global `~/.claude.json` mcpServers.citysense. The project-level
 * .mcp.json files (which do honour a `cwd` field) still use the direct command.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const PROJECT_ROOT = "D:/citysense/citysense/CitySense";
const ENV_FILE = path.join(PROJECT_ROOT, ".env");
const SERVER_ENTRY = path.join(PROJECT_ROOT, "server/mcp/server.ts");

// Move into the project root so tsx reads this dir's tsconfig.json and `@/*`
// path aliases resolve. Do this before any tsx-driven import below.
process.chdir(PROJECT_ROOT);

// Load .env manually. We can't rely on node's --env-file flag here because the
// caller (Claude Code) constructs the argv; doing it in-process is equivalent
// for these simple VAR="value" lines and works from any cwd.
try {
  const fs = await import("node:fs");
  const txt = fs.readFileSync(ENV_FILE, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch (e) {
  process.stderr.write(`[citysense-launch] failed to read .env: ${e}\n`);
}

// Now import tsx's loader, then the server entry — both resolved from the
// project root after chdir.
await import("file:///D:/citysense/citysense/CitySense/node_modules/tsx/dist/loader.mjs");

// server.ts auto-starts only when it detects it is the main entry, via
// `import.meta.url === pathToFileURL(process.argv[1]).href`. When launched
// through this wrapper, argv[1] points at launch.mjs, so that check fails and
// the server would silently exit. Rewrite argv[1] to the server entry so the
// detection succeeds and main() runs.
process.argv[1] = SERVER_ENTRY;
await import(pathToFileURL(SERVER_ENTRY).href);
