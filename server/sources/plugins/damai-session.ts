import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export type DamaiBrowserCookie = {
  name?: unknown;
  value?: unknown;
  domain?: unknown;
  path?: unknown;
  expires?: unknown;
  secure?: unknown;
  httpOnly?: unknown;
};

type DamaiCookieStore = {
  version: 1;
  savedAt: string;
  expiresAt?: string;
  cookieHeader: string;
  cookies: {
    name: string;
    domain: string;
    path?: string;
    expires?: number;
    secure?: boolean;
    httpOnly?: boolean;
  }[];
};

type DamaiSessionStore = {
  version: 1;
  id: string;
  city: string;
  keyword: string;
  startedAt: string;
  port: number;
  browserPid?: number;
};

type ActiveDamaiSession = {
  id: string;
  city: string;
  keyword: string;
  startedAt: string;
  port: number;
  webSocketUrl?: string;
  browser?: ChildProcess;
  browserPid?: number;
  closed: boolean;
};

export type DamaiSessionStatusResponse = {
  status: "ready" | "active_session" | "not_configured";
  message: string;
  cookieSource?: "env" | "file";
  cookieCount?: number;
  cookieNames?: string[];
  savedAt?: string;
  expiresAt?: string;
  activeSession?: {
    id: string;
    city: string;
    keyword: string;
    startedAt: string;
  };
  checkedAt: string;
};

export type DamaiSessionStartResponse =
  | {
      status: "ok";
      message: string;
      sessionId: string;
      city: string;
      keyword: string;
      searchUrl: string;
      startedAt: string;
    }
  | {
      status: "browser_error";
      error: string;
      message?: string;
    };

export type DamaiSessionSaveResponse =
  | {
      status: "ok";
      message: string;
      cookieCount: number;
      cookieNames: string[];
      savedAt: string;
      expiresAt?: string;
    }
  | {
      status: "not_started" | "requires_verification" | "invalid_payload" | "browser_error";
      error: string;
      message?: string;
    };

const DEFAULT_CITY = "上海";
const DEFAULT_KEYWORD = "演出";
const SESSION_DIR = process.env.DAMAI_SESSION_DIR?.trim() || path.join(process.cwd(), "data", "damai-session");
const COOKIE_FILE = path.join(SESSION_DIR, "cookies.json");
const SESSION_FILE = path.join(SESSION_DIR, "session.json");
const PROFILE_DIR = path.join(SESSION_DIR, "browser-profile");
const ALLOWED_COOKIE_DOMAIN = "damai.cn";
const ACCOUNT_COOKIE_PATTERNS = [
  /^munb$/i,
  /^unb$/i,
  /^sn$/i,
  /^cookie\d*$/i,
  /^uc\d*$/i,
  /^lgc$/i,
  /^dnk$/i,
  /^skt$/i,
  /^sgcookie$/i,
  /^tracknick$/i,
  /^_nk_$/i,
  /^lid$/i,
  /login/i,
  /nick/i,
  /member/i,
  /account/i,
  /phone/i,
  /mobile/i,
  /user/i
];

let activeSession: ActiveDamaiSession | null = null;

function normalizeCity(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_CITY;
}

function normalizeKeyword(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_KEYWORD;
}

function searchPageUrl(city: string, keyword: string) {
  const params = new URLSearchParams({
    keyword,
    cty: city,
    spm: "citysense.damai.admin"
  });

  return `https://search.damai.cn/search.html?${params.toString()}`;
}

function searchAjaxUrl(city: string, keyword: string) {
  const params = new URLSearchParams({
    keyword,
    cty: city,
    ctl: "",
    sctl: "",
    tsg: "0",
    st: "",
    et: "",
    order: "0",
    pageSize: "30",
    currPage: "1",
    tn: ""
  });

  return `https://search.damai.cn/searchajax.html?${params.toString()}`;
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
    ].filter((item): item is string => Boolean(item));
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

function findBrowserExecutable() {
  const configured = process.env.DAMAI_BROWSER_EXECUTABLE?.trim();

  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`Configured DAMAI_BROWSER_EXECUTABLE does not exist: ${configured}`);
    }

    return configured;
  }

  const found = candidateBrowserPaths().find((candidate) => existsSync(candidate));

  if (!found) {
    throw new Error("Could not find Edge or Chrome. Set DAMAI_BROWSER_EXECUTABLE.");
  }

  return found;
}

async function findFreePort() {
  return new Promise<number>((resolve, reject) => {
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

async function sleep(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForJsonList(port: number) {
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  let lastError: unknown;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(endpoint);

      if (response.ok) {
        const targets = (await response.json()) as { type?: string; url?: string; webSocketDebuggerUrl?: string }[];
        const page =
          targets.find((target) => target.type === "page" && target.url?.includes("search.damai.cn")) ??
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

  throw new Error(`Could not connect to browser DevTools: ${lastError instanceof Error ? lastError.message : "timeout"}`);
}

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private ws?: WebSocket;

  constructor(private webSocketUrl: string) {}

  async connect() {
    if (typeof WebSocket === "undefined") {
      throw new Error("Damai admin verification requires Node.js with global WebSocket support.");
    }

    this.ws = new WebSocket(this.webSocketUrl);

    await new Promise<void>((resolve, reject) => {
      this.ws?.addEventListener("open", () => resolve(), { once: true });
      this.ws?.addEventListener("error", () => reject(new Error("Browser DevTools connection failed")), { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const text = typeof event.data === "string" ? event.data : Buffer.from(event.data as ArrayBuffer).toString("utf8");
      const message = JSON.parse(text) as { id?: number; result?: unknown; error?: { message?: string; data?: string } };

      if (!message.id) {
        return;
      }

      const pending = this.pending.get(message.id);

      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(`${message.error.message ?? "CDP error"}: ${message.error.data ?? ""}`));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    const ws = this.ws;

    if (!ws) {
      throw new Error("Browser DevTools is not connected");
    }

    const id = this.nextId;
    this.nextId += 1;

    ws.send(
      JSON.stringify({
        id,
        method,
        params
      })
    );

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      });
    });
  }

  close() {
    this.ws?.close();
  }
}

async function evaluate<T>(cdp: CdpClient, functionSource: (input: { url: string }) => unknown, args: { url: string }) {
  const expression = `(${functionSource})(${JSON.stringify(args)})`;
  const result = await cdp.send<{ exceptionDetails?: unknown; result?: { value?: T } }>("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error("Browser evaluation failed");
  }

  return result.result?.value as T;
}

async function fetchSearchInBrowser(cdp: CdpClient, city: string, keyword: string) {
  return evaluate<{
    status: number;
    textPreview: string;
    bxpunish?: string | null;
    json?: unknown;
  }>(
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
        textPreview: text.slice(0, 500),
        bxpunish: response.headers.get("bxpunish"),
        json
      };
    },
    {
      url: searchAjaxUrl(city, keyword)
    }
  );
}

function isBlocked(result: { bxpunish?: string | null; textPreview?: string; json?: unknown }) {
  const text = `${JSON.stringify(result.json ?? {})}\n${result.textPreview ?? ""}`.toLowerCase();

  return Boolean(
    result.bxpunish ||
      text.includes("fail_sys_user_validate") ||
      text.includes("rgv587") ||
      text.includes("_____tmd_____") ||
      text.includes("/punish") ||
      text.includes("captcha") ||
      text.includes("验证码")
  );
}

function readCookieStoreSync(): DamaiCookieStore | null {
  try {
    const payload = JSON.parse(readFileSync(COOKIE_FILE, "utf8")) as DamaiCookieStore;
    return payload?.version === 1 && typeof payload.cookieHeader === "string" ? payload : null;
  } catch {
    return null;
  }
}

async function readCookieStore() {
  try {
    const payload = JSON.parse(await readFile(COOKIE_FILE, "utf8")) as DamaiCookieStore;
    return payload?.version === 1 && typeof payload.cookieHeader === "string" ? payload : null;
  } catch {
    return null;
  }
}

function sessionFromStore(store: DamaiSessionStore): ActiveDamaiSession | null {
  if (
    store?.version !== 1 ||
    typeof store.id !== "string" ||
    typeof store.city !== "string" ||
    typeof store.keyword !== "string" ||
    typeof store.startedAt !== "string" ||
    typeof store.port !== "number"
  ) {
    return null;
  }

  return {
    id: store.id,
    city: store.city,
    keyword: store.keyword,
    startedAt: store.startedAt,
    port: store.port,
    browserPid: store.browserPid,
    closed: false
  };
}

function readSessionStoreSync() {
  try {
    const payload = JSON.parse(readFileSync(SESSION_FILE, "utf8")) as DamaiSessionStore;
    return sessionFromStore(payload);
  } catch {
    return null;
  }
}

async function writeSessionStore(session: ActiveDamaiSession) {
  const store: DamaiSessionStore = {
    version: 1,
    id: session.id,
    city: session.city,
    keyword: session.keyword,
    startedAt: session.startedAt,
    port: session.port,
    browserPid: session.browserPid
  };

  await mkdir(SESSION_DIR, { recursive: true });
  await writeFile(SESSION_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function recoverDamaiSession() {
  if (activeSession && !activeSession.closed) {
    return activeSession;
  }

  const stored = readSessionStoreSync();

  if (!stored) {
    return null;
  }

  activeSession = stored;
  return activeSession;
}

export function getSavedDamaiCookieHeader() {
  const store = readCookieStoreSync();

  if (!store) {
    return undefined;
  }

  return store.cookieHeader || undefined;
}

function isAllowedDamaiCookieDomain(value: string) {
  const domain = value.replace(/^\./, "").toLowerCase();

  return domain === ALLOWED_COOKIE_DOMAIN || domain.endsWith(`.${ALLOWED_COOKIE_DOMAIN}`);
}

function isAccountCookieName(name: string) {
  return ACCOUNT_COOKIE_PATTERNS.some((pattern) => pattern.test(name));
}

export function filterDamaiCookies(cookies: DamaiBrowserCookie[]) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const seen = new Set<string>();

  return cookies
    .map((cookie) => {
      const name = typeof cookie.name === "string" ? cookie.name.trim() : "";
      const value = typeof cookie.value === "string" ? cookie.value : "";
      const domain = typeof cookie.domain === "string" ? cookie.domain.trim() : "";
      const cookiePath = typeof cookie.path === "string" ? cookie.path : undefined;
      const expires = typeof cookie.expires === "number" && cookie.expires > 0 ? cookie.expires : undefined;

      return {
        name,
        value,
        domain,
        path: cookiePath,
        expires,
        secure: cookie.secure === true,
        httpOnly: cookie.httpOnly === true
      };
    })
    .filter((cookie) => {
      const key = `${cookie.domain}:${cookie.name}`;

      if (
        !cookie.name ||
        !cookie.value ||
        !isAllowedDamaiCookieDomain(cookie.domain) ||
        isAccountCookieName(cookie.name) ||
        (cookie.expires !== undefined && cookie.expires < nowSeconds) ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function buildDamaiCookieHeader(cookies: ReturnType<typeof filterDamaiCookies>) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function saveCookieStore(cookies: ReturnType<typeof filterDamaiCookies>) {
  const expires = cookies.map((cookie) => cookie.expires).filter((value): value is number => Boolean(value));
  const expiresAt = expires.length ? new Date(Math.min(...expires) * 1000).toISOString() : undefined;
  const store: DamaiCookieStore = {
    version: 1,
    savedAt: new Date().toISOString(),
    expiresAt,
    cookieHeader: buildDamaiCookieHeader(cookies),
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly
    }))
  };

  await mkdir(SESSION_DIR, { recursive: true });
  await writeFile(COOKIE_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");

  return store;
}

function activeSessionView() {
  const session = recoverDamaiSession();

  if (!session || session.closed) {
    return undefined;
  }

  return {
    id: session.id,
    city: session.city,
    keyword: session.keyword,
    startedAt: session.startedAt
  };
}

export async function getDamaiSessionStatus(): Promise<DamaiSessionStatusResponse> {
  const envCookie = process.env.DAMAI_COOKIE_HEADER;

  if (envCookie) {
    return {
      status: "ready",
      message: "DAMAI_COOKIE_HEADER 已配置。",
      cookieSource: "env",
      checkedAt: new Date().toISOString()
    };
  }

  const store = await readCookieStore();

  if (store) {
    return {
      status: "ready",
      message: "大麦匿名搜索 cookie 已保存。",
      cookieSource: "file",
      cookieCount: store.cookies.length,
      cookieNames: store.cookies.map((cookie) => cookie.name),
      savedAt: store.savedAt,
      expiresAt: store.expiresAt,
      activeSession: activeSessionView(),
      checkedAt: new Date().toISOString()
    };
  }

  const active = activeSessionView();

  if (active) {
    return {
      status: "active_session",
      message: "大麦验证窗口已打开。",
      activeSession: active,
      checkedAt: new Date().toISOString()
    };
  }

  return {
    status: "not_configured",
    message: "尚未保存大麦匿名搜索 cookie。",
    checkedAt: new Date().toISOString()
  };
}

export async function startDamaiVerificationSession(input: {
  city?: unknown;
  keyword?: unknown;
}): Promise<DamaiSessionStartResponse> {
  try {
    if (activeSession && !activeSession.closed) {
      return {
        status: "ok",
        message: "大麦验证窗口已打开。",
        sessionId: activeSession.id,
        city: activeSession.city,
        keyword: activeSession.keyword,
        searchUrl: searchPageUrl(activeSession.city, activeSession.keyword),
        startedAt: activeSession.startedAt
      };
    }

    const city = normalizeCity(input.city);
    const keyword = normalizeKeyword(input.keyword);
    const browserExecutable = findBrowserExecutable();
    const port = await findFreePort();
    const searchUrl = searchPageUrl(city, keyword);

    await mkdir(PROFILE_DIR, { recursive: true });

    const browser = spawn(
      browserExecutable,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${PROFILE_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        searchUrl
      ],
      {
        stdio: "ignore"
      }
    );

    const startedAt = new Date().toISOString();
    activeSession = {
      id: `${Date.now()}-${port}`,
      city,
      keyword,
      startedAt,
      port,
      browser,
      browserPid: browser.pid,
      closed: false
    };
    await writeSessionStore(activeSession);
    browser.on("exit", () => {
      if (activeSession?.port === port) {
        activeSession.closed = true;
      }
      void rm(SESSION_FILE, { force: true });
    });
    const session = activeSession;

    return {
      status: "ok",
      message: "大麦验证窗口已打开。",
      sessionId: session.id,
      city,
      keyword,
      searchUrl,
      startedAt
    };
  } catch (error) {
    return {
      status: "browser_error",
      error: error instanceof Error ? error.message : "大麦验证窗口启动失败"
    };
  }
}

async function webSocketUrlForSession(session: ActiveDamaiSession) {
  if (session.webSocketUrl) {
    return session.webSocketUrl;
  }

  const webSocketUrl = await waitForJsonList(session.port);

  if (!session.closed) {
    session.webSocketUrl = webSocketUrl;
  }

  return webSocketUrl;
}

export async function saveDamaiVerificationCookies(input: {
  city?: unknown;
  keyword?: unknown;
}): Promise<DamaiSessionSaveResponse> {
  const session = recoverDamaiSession();

  if (!session || session.closed) {
    return {
      status: "not_started",
      error: "大麦验证窗口尚未打开"
    };
  }

  const city = normalizeCity(input.city ?? session.city);
  const keyword = normalizeKeyword(input.keyword ?? session.keyword);
  let cdp: CdpClient | null = null;

  try {
    const webSocketUrl = await webSocketUrlForSession(session);
    cdp = new CdpClient(webSocketUrl);
    await cdp.connect();
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");

    const searchResult = await fetchSearchInBrowser(cdp, city, keyword);

    if (searchResult.status >= 400 || isBlocked(searchResult)) {
      return {
        status: "requires_verification",
        error: "大麦仍要求验证码或风控验证",
        message: "请先在打开的大麦浏览器窗口完成验证，再回到此页面保存 cookie。"
      };
    }

    const result = await cdp.send<{ cookies?: DamaiBrowserCookie[] }>("Network.getAllCookies");
    const cookies = filterDamaiCookies(result.cookies ?? []);

    if (cookies.length === 0) {
      return {
        status: "invalid_payload",
        error: "没有找到可保存的大麦匿名 cookie"
      };
    }

    const store = await saveCookieStore(cookies);

    return {
      status: "ok",
      message: "大麦匿名搜索 cookie 已保存。",
      cookieCount: store.cookies.length,
      cookieNames: store.cookies.map((cookie) => cookie.name),
      savedAt: store.savedAt,
      expiresAt: store.expiresAt
    };
  } catch (error) {
    return {
      status: "browser_error",
      error: error instanceof Error ? error.message : "大麦 cookie 保存失败"
    };
  } finally {
    cdp?.close();
  }
}
