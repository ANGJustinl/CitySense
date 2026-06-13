#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright-core");

const DEFAULT_EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const DEFAULT_URL = "https://www.xiaohongshu.com/ai_chat";

function parseArgs(argv) {
  const args = {
    headless: false,
    includeSources: false,
    keepOpen: false,
    keepProfile: false,
    sourceLimit: 30,
    sourceWaitMs: 15000,
    timeoutMs: 90000,
    edge: DEFAULT_EDGE_PATH,
    url: DEFAULT_URL,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--headless") args.headless = true;
    else if (arg === "--include-sources") args.includeSources = true;
    else if (arg === "--keep-open") args.keepOpen = true;
    else if (arg === "--keep-profile") args.keepProfile = true;
    else if (arg === "--prompt") args.prompt = argv[++i];
    else if (arg === "--cookie-file") args.cookieFile = argv[++i];
    else if (arg === "--curl-file") args.curlFile = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--source-limit") args.sourceLimit = Number(argv[++i]);
    else if (arg === "--source-wait-ms") args.sourceWaitMs = Number(argv[++i]);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (arg === "--edge") args.edge = argv[++i];
    else if (arg === "--url") args.url = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.prompt) {
    throw new Error("Missing --prompt");
  }
  if (!args.cookieFile && !args.curlFile && !process.env.XHS_COOKIE && !process.env.XHS_COOKIE_FILE) {
    throw new Error("Provide --cookie-file, --curl-file, XHS_COOKIE, or XHS_COOKIE_FILE");
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node outputs/xhs-ai-chat.cjs --cookie-file work/xhs-cookie.txt --prompt "your question"
  node outputs/xhs-ai-chat.cjs --curl-file pasted-curl.txt --prompt "your question"

Options:
  --prompt <text>         Question to send.
  --cookie-file <path>    File containing a raw Cookie header.
  --curl-file <path>      File containing a copied cURL; the script extracts -b / Cookie.
  --out <path>            Save JSON result.
  --include-sources       Open the rendered reference drawer and extract source notes.
  --source-limit <number> Max source notes to return. Default: 30.
  --source-wait-ms <num>  Wait time for source drawer. Default: 15000.
  --headless              Run without a visible Edge window. Visible mode is safer.
  --timeout-ms <number>   Wait time for the answer. Default: 90000.
  --edge <path>           Edge executable path.
  --keep-open             Leave browser open after completion.
  --keep-profile          Do not delete the temporary browser profile.
`);
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(filePath), "utf8");
}

function unescapeWindowsCurl(value) {
  return value
    .replace(/\^"/g, "\"")
    .replace(/\^\{/g, "{")
    .replace(/\^\}/g, "}")
    .replace(/\^%/g, "%")
    .replace(/\^\[/g, "[")
    .replace(/\^\]/g, "]")
    .trim();
}

function extractCookieHeader(text) {
  const raw = text.trim();

  const cmdCurl = raw.match(/(?:^|\s)-b\s+\^"([\s\S]*?)\^"/);
  if (cmdCurl) return unescapeWindowsCurl(cmdCurl[1]);

  const doubleQuoted = raw.match(/(?:^|\s)(?:-b|--cookie)\s+"([\s\S]*?)"/);
  if (doubleQuoted) return doubleQuoted[1].trim();

  const singleQuoted = raw.match(/(?:^|\s)(?:-b|--cookie)\s+'([\s\S]*?)'/);
  if (singleQuoted) return singleQuoted[1].trim();

  const cookieHeader = raw.match(/^cookie:\s*(.+)$/im);
  if (cookieHeader) return cookieHeader[1].trim();

  if (raw.includes("=") && raw.includes(";")) return unescapeWindowsCurl(raw);
  throw new Error("Could not find a cookie string in the supplied file/text");
}

function getCookieHeader(args) {
  if (process.env.XHS_COOKIE) return process.env.XHS_COOKIE.trim();
  if (process.env.XHS_COOKIE_FILE) return extractCookieHeader(readText(process.env.XHS_COOKIE_FILE));
  if (args.cookieFile) return extractCookieHeader(readText(args.cookieFile));
  return extractCookieHeader(readText(args.curlFile));
}

function parseCookiePairs(cookieHeader) {
  return cookieHeader
    .split(/;\s*/)
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return {
        name: eq >= 0 ? pair.slice(0, eq).trim() : pair.trim(),
        value: eq >= 0 ? pair.slice(eq + 1).trim() : "",
      };
    })
    .filter((cookie) => cookie.name);
}

function cookiesForXhs(cookieHeader) {
  const domains = [".xiaohongshu.com", "www.xiaohongshu.com", "so.xiaohongshu.com", "edith.xiaohongshu.com"];
  const cookies = [];
  for (const cookie of parseCookiePairs(cookieHeader)) {
    for (const domain of domains) {
      cookies.push({
        ...cookie,
        domain,
        path: "/",
        secure: true,
        sameSite: "Lax",
      });
    }
  }
  return cookies;
}

function interestingUrl(url) {
  return /send\/ai|stream\/tokens|guide\/words|history\/detail|history\/list|celestial\/connect|rwp|dqa/i.test(url);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTextarea(page, timeoutMs) {
  const candidates = [
    "textarea.textarea",
    ".ai-chat-input-box textarea",
    "textarea",
  ];

  for (const selector of candidates) {
    try {
      await page.waitForSelector(selector, { timeout: Math.min(timeoutMs, 30000), state: "visible" });
      return selector;
    } catch {}
  }
  throw new Error("Could not find the chat textarea");
}

async function sendPrompt(page, prompt, timeoutMs) {
  const textareaSelector = await waitForTextarea(page, timeoutMs);
  await page.fill(textareaSelector, prompt);
  await sleep(500);

  const sendResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/sns/web/search/send/ai") && res.request().method() === "POST",
    { timeout: timeoutMs },
  );

  const buttonClass = await page.evaluate(() => {
    const button = document.querySelector(".submit-button-wrapper");
    return button ? String(button.className || "") : "";
  });

  if (buttonClass && !buttonClass.includes("disabled")) {
    await page.click(".submit-button-wrapper");
  } else {
    await page.keyboard.press("Enter");
  }

  const sendResponse = await sendResponsePromise;
  const sendText = await sendResponse.text();
  let sendJson;
  try {
    sendJson = JSON.parse(sendText);
  } catch {
    throw new Error(`send/ai did not return JSON: ${sendText.slice(0, 300)}`);
  }

  if (!sendJson.success || !sendJson.data || !sendJson.data.appCid || !sendJson.data.msgId) {
    throw new Error(`send/ai failed: ${sendText.slice(0, 500)}`);
  }

  return sendJson;
}

async function waitForAnswer(page, appCid, msgId, timeoutMs) {
  const started = Date.now();
  let lastState = null;

  while (Date.now() - started < timeoutMs) {
    lastState = await page.evaluate(({ appCid, msgId }) => {
      const debug = window.__XHS_AI_DEBUG__;
      if (!debug) return { hasDebug: false };

      function clone(value) {
        try {
          return JSON.parse(JSON.stringify(value));
        } catch {
          return null;
        }
      }

      const messages = clone(debug.messages) || [];
      const rounds = clone(debug.rounds) || [];
      const aiMessage =
        messages.find((message) =>
          message &&
          message.sender === "ai" &&
          message.conversationId === appCid &&
          (message.msgId === `ai-${msgId}` || String(message.msgId || "").includes(String(msgId).replace("$prod", "")))
        ) ||
        rounds.map((round) => round && round.aiMessage).find((message) =>
          message &&
          message.conversationId === appCid &&
          (message.msgId === `ai-${msgId}` || String(message.msgId || "").includes(String(msgId).replace("$prod", "")))
        );

      if (!aiMessage) {
        return { hasDebug: true, found: false, messageCount: messages.length, roundCount: rounds.length };
      }

      const text =
        aiMessage.text ||
        (aiMessage.dataFragments || [])
          .filter((fragment) => fragment && fragment.fragmentType === 1)
          .sort((a, b) => (a.indexInConversation || 0) - (b.indexInConversation || 0))
          .map((fragment) => fragment.text || "")
          .join("");

      return {
        hasDebug: true,
        found: true,
        finished: !!aiMessage.isFinished,
        text,
        querySource: aiMessage.querySource || null,
        thinkProgress: aiMessage.thinkProgress || [],
        fragments: (aiMessage.dataFragments || []).map((fragment) => ({
          fragmentType: fragment.fragmentType,
          indexInConversation: fragment.indexInConversation,
          text: fragment.text || "",
        })),
      };
    }, { appCid, msgId });

    if (lastState && lastState.found && lastState.finished && String(lastState.text || "").trim()) {
      return lastState;
    }
    await sleep(1000);
  }

  throw new Error(`Timed out waiting for answer. Last state: ${JSON.stringify(lastState).slice(0, 1000)}`);
}

async function clickLastProgressWrapper(page, timeoutMs) {
  const progress = page.locator(".progress-wrapper").last();
  await progress.waitFor({ state: "visible", timeout: timeoutMs });
  await progress.scrollIntoViewIfNeeded().catch(() => {});

  try {
    await progress.click({ timeout: timeoutMs });
  } catch {
    await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll(".progress-wrapper"));
      const last = nodes[nodes.length - 1];
      if (!last) throw new Error("No .progress-wrapper found");
      last.click();
    });
  }
}

async function extractSourceNotes(page, limit) {
  return page.evaluate((sourceLimit) => {
    function abs(href) {
      try {
        return href ? new URL(href, location.origin).href : "";
      } catch {
        return href || "";
      }
    }

    function noteIdFromUrl(url) {
      const match = String(url || "").match(/(?:explore|search_result|discovery\/item)\/([0-9a-fA-F]+)/);
      return match ? match[1] : "";
    }

    return Array.from(document.querySelectorAll("section.note-item"))
      .slice(0, sourceLimit)
      .map((el, idx) => {
        const titleEl = el.querySelector("a.title");
        const coverEl = el.querySelector("a.cover");
        const authorEl = el.querySelector("a.author");
        const img = el.querySelector("img");
        const url = abs(
          (titleEl && titleEl.getAttribute("href")) ||
            (coverEl && coverEl.getAttribute("href")) ||
            "",
        );
        const author =
          (el.querySelector(".name") && el.querySelector(".name").textContent.trim()) ||
          (authorEl && authorEl.textContent.replace(/\n.*/s, "").trim()) ||
          "";
        const likedCountEl = el.querySelector(".like-wrapper .count, .like-wrapper");

        return {
          idx,
          noteId: noteIdFromUrl(url),
          title: (titleEl && titleEl.textContent.trim()) || "",
          url,
          cover: (img && (img.currentSrc || img.src)) || "",
          author,
          time: (el.querySelector(".time") && el.querySelector(".time").textContent.trim()) || "",
          likedCount: (likedCountEl && likedCountEl.textContent.trim()) || "",
          text: el.innerText.trim(),
        };
      })
      .filter((note) => note.title || note.url);
  }, limit);
}

async function getAnswerSources(page, limit, timeoutMs) {
  const progressEntries = await page.locator(".progress-wrapper").count().catch(() => 0);
  if (!progressEntries) {
    return {
      ok: false,
      reason: "No rendered source/progress entry was found for this answer.",
      notes: [],
    };
  }

  await clickLastProgressWrapper(page, timeoutMs);
  await page.waitForSelector("section.note-item", { state: "attached", timeout: timeoutMs });
  const notes = await extractSourceNotes(page, limit);

  return {
    ok: notes.length > 0,
    reason: notes.length > 0 ? "" : "The source drawer opened, but no note cards were found.",
    progressEntries,
    notes,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const profileDir = path.join(os.tmpdir(), `xhs-ai-chat-${Date.now()}`);
  const events = [];

  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: args.edge,
    headless: args.headless,
    viewport: { width: 1365, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    await context.addCookies(cookiesForXhs(getCookieHeader(args)));
    const page = await context.newPage();

    page.on("websocket", (ws) => {
      events.push({ kind: "websocket", url: ws.url() });
    });

    page.on("request", (req) => {
      const url = req.url();
      if (interestingUrl(url)) {
        events.push({ kind: "request", method: req.method(), url });
      }
    });

    page.on("response", async (res) => {
      const url = res.url();
      if (!interestingUrl(url)) return;
      let text = "";
      try {
        text = await res.text();
      } catch {}
      events.push({ kind: "response", status: res.status(), url, text: text.slice(0, 1200) });
    });

    await page.goto(args.url, { waitUntil: "domcontentloaded", timeout: args.timeoutMs });
    await page.waitForFunction(() => !!window.__XHS_AI_DEBUG__, null, { timeout: args.timeoutMs }).catch(() => {});

    const sendJson = await sendPrompt(page, args.prompt, args.timeoutMs);
    const { appCid, msgId, extension } = sendJson.data;
    const answerState = await waitForAnswer(page, appCid, msgId, args.timeoutMs);
    let sources = null;

    if (args.includeSources) {
      sources = await getAnswerSources(page, args.sourceLimit, args.sourceWaitMs).catch((error) => ({
        ok: false,
        reason: error.message,
        notes: [],
      }));
    }

    const result = {
      ok: true,
      prompt: args.prompt,
      conversationId: appCid,
      messageId: msgId,
      uuid: extension && extension.uuid,
      answer: String(answerState.text || "").trim(),
      querySource: answerState.querySource,
      thinkProgress: answerState.thinkProgress,
      fragmentCount: Array.isArray(answerState.fragments) ? answerState.fragments.length : 0,
      sources,
      events,
    };

    const json = JSON.stringify(result, null, 2);
    if (args.out) fs.writeFileSync(path.resolve(args.out), json, "utf8");
    console.log(json);

    if (args.keepOpen) {
      console.error("Browser left open because --keep-open was set.");
      await new Promise(() => {});
    }
  } finally {
    if (!args.keepOpen) await context.close().catch(() => {});
    if (!args.keepProfile) fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
