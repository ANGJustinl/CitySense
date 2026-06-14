#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CONFIG_PATH = path.join(__dirname, "config.json");
const EXAMPLE_CONFIG_PATH = path.join(__dirname, "config.example.json");

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const key = rawKey.trim();

    if (!key) {
      continue;
    }

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];

    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Damai browser-assisted search exporter

Usage:
  node tools/damai-search/damai-search.mjs --init-config
  node tools/damai-search/damai-search.mjs --city 上海 --pages 3
  node tools/damai-search/damai-search.mjs --config tools/damai-search/config.json

Notes:
  - Uses a dedicated browser profile under tools/damai-search by default.
  - Does not read, print, or store browser cookies.
  - If Damai asks for captcha, complete it in the browser window and press Enter here.
`);
}

async function initConfig(targetPath) {
  if (existsSync(targetPath)) {
    throw new Error(`Config already exists: ${targetPath}`);
  }

  const example = await readFile(EXAMPLE_CONFIG_PATH, "utf8");
  await writeFile(targetPath, example, "utf8");
  console.log(`Created config: ${targetPath}`);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function resolveFrom(baseDir, value) {
  if (!value) {
    return undefined;
  }

  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

async function loadConfig(args) {
  const configPath = path.resolve(String(args.config ?? DEFAULT_CONFIG_PATH));
  const configDir = path.dirname(configPath);
  const config = existsSync(configPath)
    ? JSON.parse(await readFile(configPath, "utf8"))
    : JSON.parse(await readFile(EXAMPLE_CONFIG_PATH, "utf8"));

  return {
    city: String(args.city ?? config.city ?? "上海"),
    keyword: String(args.keyword ?? config.keyword ?? ""),
    pages: Math.max(1, Math.min(10, parseNumber(args.pages ?? config.pages, 3))),
    pageSize: Math.max(1, Math.min(30, parseNumber(args.pageSize ?? config.pageSize, 30))),
    order: Number(args.order ?? config.order ?? 0),
    outputDir: resolveFrom(configDir, args.outputDir ?? config.outputDir ?? "./output"),
    userDataDir: resolveFrom(configDir, args.userDataDir ?? config.userDataDir ?? "./.browser-profile"),
    browserExecutable: String(args.browserExecutable ?? config.browserExecutable ?? "").trim(),
    closeBrowser: parseBoolean(args.closeBrowser ?? config.closeBrowser, false),
    includeRaw: parseBoolean(args.includeRaw ?? config.includeRaw, false),
    requestDelayMs: parseNumber(args.requestDelayMs ?? config.requestDelayMs, 1500),
    maxCaptchaRetries: Math.max(1, Math.min(10, parseNumber(args.maxCaptchaRetries ?? config.maxCaptchaRetries, 3)))
  };
}

function candidateBrowserPaths() {
  const home = os.homedir();
  const platform = os.platform();

  if (platform === "win32") {
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    const localAppData = process.env.LOCALAPPDATA;

    return [
      programFilesX86 && path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      programFiles && path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      localAppData && path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
      programFiles && path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      programFilesX86 && path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
    ].filter(Boolean);
  }

  if (platform === "darwin") {
    return [
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome")
    ];
  }

  return [
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
}

function findBrowserExecutable(configured) {
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`Configured browserExecutable does not exist: ${configured}`);
    }

    return configured;
  }

  const found = candidateBrowserPaths().find((candidate) => existsSync(candidate));

  if (!found) {
    throw new Error("Could not find Edge or Chrome. Set browserExecutable in config.json.");
  }

  return found;
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Could not allocate a local port"));
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function searchPageUrl(config) {
  const params = new URLSearchParams({
    keyword: config.keyword,
    cty: config.city,
    spm: "citysense.damai.browser_assisted"
  });

  return `https://search.damai.cn/search.html?${params.toString()}`;
}

function searchAjaxUrl(config, page) {
  const params = new URLSearchParams({
    keyword: config.keyword,
    cty: config.city,
    ctl: "",
    sctl: "",
    tsg: "0",
    st: "",
    et: "",
    order: String(config.order),
    pageSize: String(config.pageSize),
    currPage: String(page),
    tn: ""
  });

  return `https://search.damai.cn/searchajax.html?${params.toString()}`;
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForJsonList(port) {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  let lastError;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(endpoint);

      if (response.ok) {
        const targets = await response.json();
        const page =
          targets.find((target) => target.type === "page" && target.url.includes("search.damai.cn")) ??
          targets.find((target) => target.type === "page");

        if (page?.webSocketDebuggerUrl) {
          return page.webSocketDebuggerUrl;
        }
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(`Could not connect to browser DevTools: ${lastError?.message ?? "timeout"}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (typeof WebSocket === "undefined") {
      throw new Error("This script requires Node.js with global WebSocket support.");
    }

    this.ws = new WebSocket(this.webSocketUrl);

    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const text = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
      const message = JSON.parse(text);

      if (!message.id) {
        return;
      }

      const pending = this.pending.get(message.id);

      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    const payload = JSON.stringify({
      id,
      method,
      params
    });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  close() {
    this.ws?.close();
  }
}

async function evaluate(cdp, functionSource, args) {
  const expression = `(${functionSource})(${JSON.stringify(args)})`;
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed");
  }

  return result.result.value;
}

async function fetchInBrowser(cdp, url) {
  return evaluate(
    cdp,
    async function browserFetch(input) {
      const response = await fetch(input.url, {
        method: "GET",
        credentials: "include",
        headers: {
          accept: "application/json, text/plain, */*"
        }
      });
      const text = await response.text();
      let json = null;

      try {
        json = JSON.parse(text);
      } catch {}

      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        bxpunish: response.headers.get("bxpunish"),
        textPreview: text.slice(0, 500),
        json
      };
    },
    { url }
  );
}

function extractCaptchaUrl(result) {
  if (result?.json?.data?.url) {
    return result.json.data.url;
  }

  const preview = result?.textPreview ?? "";
  const replaceMatch = preview.match(/window\.location\.replace\("([^"]+)"/);

  if (replaceMatch?.[1]) {
    return replaceMatch[1];
  }

  const urlMatch = preview.match(/"url":"([^"]+)"/);

  if (urlMatch?.[1]) {
    return urlMatch[1].replaceAll("\\/", "/");
  }

  return null;
}

function isBlocked(result) {
  const ret = Array.isArray(result?.json?.ret) ? result.json.ret.join(" ") : "";

  return Boolean(
    result?.bxpunish ||
      ret.includes("FAIL_SYS_USER_VALIDATE") ||
      ret.includes("RGV587") ||
      result?.textPreview?.includes("_____tmd_____/punish") ||
      result?.textPreview?.toLowerCase().includes("captcha")
  );
}

async function waitForUser(message) {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    await readline.question(`${message}\nPress Enter to continue...`);
  } finally {
    readline.close();
  }
}

async function ensureSearchAccess(cdp, config, initialResult) {
  let result = initialResult;

  for (let attempt = 1; attempt <= config.maxCaptchaRetries; attempt += 1) {
    if (!isBlocked(result)) {
      return result;
    }

    const captchaUrl = extractCaptchaUrl(result);

    if (captchaUrl) {
      console.log(`Damai asked for validation. Opening captcha page (attempt ${attempt}/${config.maxCaptchaRetries}).`);
      await cdp.send("Page.navigate", { url: captchaUrl });
    } else {
      console.log(`Damai asked for validation, but no captcha URL was found (attempt ${attempt}/${config.maxCaptchaRetries}).`);
      await cdp.send("Page.navigate", { url: searchPageUrl(config) });
    }

    await waitForUser("Complete the captcha in the browser window.");
    await cdp.send("Page.navigate", { url: searchPageUrl(config) });
    await sleep(1000);
    result = await fetchInBrowser(cdp, searchAjaxUrl(config, 1));
  }

  throw new Error("Damai search is still blocked after captcha retries.");
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value) {
  const url = String(value ?? "").trim();

  if (!url) {
    return undefined;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  return url;
}

function normalizeItem(item, includeRaw) {
  const projectId = String(item.projectid ?? item.projectId ?? "").trim();

  if (!projectId) {
    return null;
  }

  const normalized = {
    id: `damai-${projectId}`,
    source: "damai",
    sourceId: projectId,
    sourceUrl: `https://detail.damai.cn/item.htm?id=${projectId}`,
    title: stripHtml(item.nameNoHtml ?? item.name ?? item.projectName),
    city: stripHtml(item.cityname),
    venueName: stripHtml(item.venue),
    showTime: stripHtml(item.showtime ?? item.showTime),
    priceText: stripHtml(item.price_str ?? item.price),
    category: stripHtml(item.categoryname),
    imageUrl: absoluteUrl(item.verticalPic),
    showStatus: stripHtml(item.showstatus),
    description: stripHtml(item.description)
  };

  if (includeRaw) {
    normalized.raw = item;
  }

  return normalized;
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (seen.has(item.sourceId)) {
      continue;
    }

    seen.add(item.sourceId);
    result.push(item);
  }

  return result;
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function exportDamaiSearch(config) {
  const browserExecutable = findBrowserExecutable(config.browserExecutable);
  const port = await findFreePort();
  await mkdir(config.userDataDir, { recursive: true });
  await mkdir(config.outputDir, { recursive: true });

  console.log(`Browser: ${browserExecutable}`);
  console.log(`Profile: ${config.userDataDir}`);
  console.log(`City: ${config.city}, pages: ${config.pages}, pageSize: ${config.pageSize}`);

  const browser = spawn(
    browserExecutable,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${config.userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--new-window",
      searchPageUrl(config)
    ],
    {
      stdio: "ignore"
    }
  );

  let cdp;

  try {
    const webSocketUrl = await waitForJsonList(port);
    cdp = new CdpClient(webSocketUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await sleep(1200);

    const firstUrl = searchAjaxUrl(config, 1);
    let firstResult = await fetchInBrowser(cdp, firstUrl);
    firstResult = await ensureSearchAccess(cdp, config, firstResult);

    const allItems = [];
    const pageSummaries = [];

    for (let page = 1; page <= config.pages; page += 1) {
      const result = page === 1 ? firstResult : await fetchInBrowser(cdp, searchAjaxUrl(config, page));

      if (isBlocked(result)) {
        throw new Error(`Damai blocked page ${page}; rerun the script and complete captcha again.`);
      }

      const pageData = result.json?.pageData;
      const rawItems = Array.isArray(pageData?.resultData) ? pageData.resultData : [];
      const items = rawItems
        .map((item) => normalizeItem(item, config.includeRaw))
        .filter(Boolean);

      allItems.push(...items);
      pageSummaries.push({
        page,
        count: items.length,
        totalResults: pageData?.totalResults,
        totalPage: pageData?.totalPage
      });

      console.log(`Fetched page ${page}: ${items.length} items`);

      if (page < config.pages && config.requestDelayMs > 0) {
        await sleep(config.requestDelayMs);
      }
    }

    const exported = {
      source: "damai-browser-assisted",
      generatedAt: new Date().toISOString(),
      query: {
        city: config.city,
        keyword: config.keyword,
        pages: config.pages,
        pageSize: config.pageSize,
        order: config.order
      },
      pageSummaries,
      count: dedupeItems(allItems).length,
      items: dedupeItems(allItems)
    };
    const outputFile = path.join(
      config.outputDir,
      `damai-${config.city || "all"}-${timestampForFilename()}.json`
    );

    await writeFile(outputFile, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
    console.log(`Exported ${exported.count} items to ${outputFile}`);

    return outputFile;
  } finally {
    cdp?.close();

    if (config.closeBrowser) {
      browser.kill();
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printHelp();
    return;
  }

  const configPath = path.resolve(String(args.config ?? DEFAULT_CONFIG_PATH));

  if (args["init-config"]) {
    await initConfig(configPath);
    return;
  }

  const config = await loadConfig(args);
  await exportDamaiSearch(config);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
