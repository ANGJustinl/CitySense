"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  DatabaseZap,
  KeyRound,
  Loader2,
  Play,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Ticket
} from "lucide-react";
import type { IngestStatusResponse } from "@/server/ingest/status";

type SourceIngestConsoleProps = {
  initialStatus: IngestStatusResponse;
};

type XhsLoginStatus = {
  status: "logged_in" | "not_logged_in" | "unknown";
  message: string;
  requiresVerificationCode?: boolean;
  checkedAt?: string;
};

type XhsLoginQrcode = {
  status: "ok" | "not_configured" | "tool_error" | "invalid_payload";
  message?: string;
  imageDataUrl?: string;
  expiresAt?: string;
  error?: string;
};

type XhsVerificationCodeResponse = {
  status: "ok" | "not_logged_in" | "not_configured" | "tool_error" | "invalid_payload";
  message?: string;
  error?: string;
  loggedIn?: boolean;
  username?: string;
};

type DamaiSessionStatus = {
  status: "ready" | "active_session" | "not_configured";
  message: string;
  cookieSource?: "env" | "file";
  cookieCount?: number;
  cookieNames?: string[];
  savedAt?: string;
  expiresAt?: string;
  checkedAt?: string;
  activeSession?: {
    id: string;
    city: string;
    keyword: string;
    startedAt: string;
  };
};

type DamaiSessionStartResponse = {
  status: "ok" | "browser_error";
  message?: string;
  error?: string;
  sessionId?: string;
  city?: string;
  keyword?: string;
  searchUrl?: string;
  startedAt?: string;
};

type DamaiSessionSaveResponse = {
  status: "ok" | "not_started" | "requires_verification" | "invalid_payload" | "browser_error";
  message?: string;
  error?: string;
  cookieCount?: number;
  cookieNames?: string[];
  savedAt?: string;
  expiresAt?: string;
};

function formatDate(value?: string, mounted = true) {
  if (!value || !mounted) {
    return "-";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function connectorIcon(status: string) {
  return status === "active" ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />;
}

function xhsStatusText(status?: XhsLoginStatus["status"]) {
  if (status === "logged_in") {
    return "已登录";
  }

  if (status === "not_logged_in") {
    return "未登录";
  }

  return "未知";
}

function damaiStatusText(status?: DamaiSessionStatus["status"]) {
  if (status === "ready") {
    return "可采集";
  }

  if (status === "active_session") {
    return "验证中";
  }

  return "未配置";
}

function damaiStatusClass(status?: DamaiSessionStatus["status"]) {
  if (status === "ready") {
    return "logged_in";
  }

  if (status === "active_session") {
    return "not_logged_in";
  }

  return "unknown";
}

function damaiVerificationKeyword(keywords: string[]) {
  return keywords.find((keyword) => /演出|演唱会|音乐|livehouse|话剧|音乐剧|脱口秀|展览|亲子|动漫/i.test(keyword)) ?? "演出";
}

export function SourceIngestConsole({ initialStatus }: SourceIngestConsoleProps) {
  const [status, setStatus] = useState<IngestStatusResponse>(initialStatus);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [xhsStatus, setXhsStatus] = useState<XhsLoginStatus | null>(null);
  const [xhsQrcode, setXhsQrcode] = useState<XhsLoginQrcode | null>(null);
  const [xhsVerificationCode, setXhsVerificationCode] = useState("");
  const [damaiStatus, setDamaiStatus] = useState<DamaiSessionStatus | null>(null);
  const [city, setCity] = useState("上海");
  const [area, setArea] = useState("静安寺");
  const [keywords, setKeywords] = useState("咖啡,展览,书店");
  const [force, setForce] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>(() =>
    initialStatus.connectors.map((connector) => connector.source)
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xhsError, setXhsError] = useState<string | null>(null);
  const [damaiError, setDamaiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingXhsQr, setIsLoadingXhsQr] = useState(false);
  const [isCheckingXhs, setIsCheckingXhs] = useState(false);
  const [isSubmittingXhsCode, setIsSubmittingXhsCode] = useState(false);
  const [isStartingDamai, setIsStartingDamai] = useState(false);
  const [isSavingDamai, setIsSavingDamai] = useState(false);
  const [isCheckingDamai, setIsCheckingDamai] = useState(false);
  const isRefreshingXhsStatusRef = useRef(false);
  const isRefreshingDamaiStatusRef = useRef(false);

  const activeRun = status.run ?? status.recentRuns.find((run) => run.id === activeRunId);
  const isRunning =
    activeRun?.status === "queued" || activeRun?.status === "running" || isSubmitting;
  const isXhsBusy = isLoadingXhsQr || isCheckingXhs || isSubmittingXhsCode;
  const canSubmitXhsVerificationCode = Boolean(
    xhsQrcode?.imageDataUrl && xhsStatus?.status !== "logged_in"
  );
  const hasDamaiConnector = useMemo(
    () => status.connectors.some((connector) => connector.source === "damai"),
    [status.connectors]
  );
  const keywordList = useMemo(
    () =>
      keywords
        .split(/[,\s，]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    [keywords]
  );
  const damaiKeyword = useMemo(() => damaiVerificationKeyword(keywordList), [keywordList]);

  const refresh = useCallback(async (runId = activeRunId) => {
    const response = await fetch(runId ? `/api/ingest/status?runId=${runId}` : "/api/ingest/status");
    setStatus((await response.json()) as IngestStatusResponse);
  }, [activeRunId]);

  const refreshXhsStatus = useCallback(async () => {
    if (isRefreshingXhsStatusRef.current) {
      return;
    }

    isRefreshingXhsStatusRef.current = true;
    setIsCheckingXhs(true);
    setXhsError(null);

    try {
      const response = await fetch("/api/admin/xhs-login/status");
      const payload = (await response.json()) as XhsLoginStatus;

      if (!response.ok) {
        throw new Error(payload.message ?? "小红书登录状态检查失败");
      }

      setXhsStatus(payload);
    } catch (statusError) {
      setXhsError(statusError instanceof Error ? statusError.message : "小红书登录状态检查失败");
    } finally {
      isRefreshingXhsStatusRef.current = false;
      setIsCheckingXhs(false);
    }
  }, []);

  const refreshDamaiStatus = useCallback(async () => {
    if (!hasDamaiConnector || isRefreshingDamaiStatusRef.current) {
      return;
    }

    isRefreshingDamaiStatusRef.current = true;
    setIsCheckingDamai(true);
    setDamaiError(null);

    try {
      const response = await fetch("/api/admin/damai-session/status");
      const payload = (await response.json()) as DamaiSessionStatus;

      if (!response.ok) {
        throw new Error(payload.message ?? "大麦验证状态检查失败");
      }

      setDamaiStatus(payload);
    } catch (statusError) {
      setDamaiError(statusError instanceof Error ? statusError.message : "大麦验证状态检查失败");
    } finally {
      isRefreshingDamaiStatusRef.current = false;
      setIsCheckingDamai(false);
    }
  }, [hasDamaiConnector]);

  async function startDamaiSession() {
    setIsStartingDamai(true);
    setDamaiError(null);

    try {
      const response = await fetch("/api/admin/damai-session/start", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          city,
          keyword: damaiKeyword
        })
      });
      const payload = (await response.json()) as DamaiSessionStartResponse;

      if (!response.ok || payload.status !== "ok") {
        throw new Error(payload.error ?? payload.message ?? "大麦验证窗口启动失败");
      }

      setDamaiStatus({
        status: "active_session",
        message: payload.message ?? "大麦验证窗口已打开。",
        activeSession: payload.sessionId
          ? {
              id: payload.sessionId,
              city: payload.city ?? city,
              keyword: payload.keyword ?? damaiKeyword,
              startedAt: payload.startedAt ?? new Date().toISOString()
            }
          : undefined
      });
    } catch (startError) {
      setDamaiError(startError instanceof Error ? startError.message : "大麦验证窗口启动失败");
    } finally {
      setIsStartingDamai(false);
    }
  }

  async function saveDamaiCookies() {
    setIsSavingDamai(true);
    setDamaiError(null);

    try {
      const response = await fetch("/api/admin/damai-session/save", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          city,
          keyword: damaiKeyword
        })
      });
      const payload = (await response.json()) as DamaiSessionSaveResponse;

      if (!response.ok || payload.status !== "ok") {
        throw new Error(payload.error ?? payload.message ?? "大麦 cookie 保存失败");
      }

      setDamaiStatus({
        status: "ready",
        message: payload.message ?? "大麦匿名搜索 cookie 已保存。",
        cookieSource: "file",
        cookieCount: payload.cookieCount,
        cookieNames: payload.cookieNames,
        savedAt: payload.savedAt,
        expiresAt: payload.expiresAt
      });
      await refreshDamaiStatus();
      await refresh();
    } catch (saveError) {
      setDamaiError(saveError instanceof Error ? saveError.message : "大麦 cookie 保存失败");
    } finally {
      setIsSavingDamai(false);
    }
  }

  async function requestXhsQrcode() {
    setIsLoadingXhsQr(true);
    setXhsError(null);

    try {
      const response = await fetch("/api/admin/xhs-login/qrcode", {
        method: "POST"
      });
      const payload = (await response.json()) as XhsLoginQrcode;

      if (!response.ok || payload.status !== "ok") {
        throw new Error(payload.error ?? "小红书登录二维码生成失败");
      }

      setXhsQrcode(payload);
    } catch (qrError) {
      setXhsError(qrError instanceof Error ? qrError.message : "小红书登录二维码生成失败");
    } finally {
      setIsLoadingXhsQr(false);
    }
  }

  async function submitXhsVerificationCode() {
    const code = xhsVerificationCode.trim();

    if (!code) {
      setXhsError("验证码不能为空");
      return;
    }

    setIsSubmittingXhsCode(true);
    setXhsError(null);

    try {
      const response = await fetch("/api/admin/xhs-login/verification-code", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          code
        })
      });
      const payload = (await response.json()) as XhsVerificationCodeResponse;

      if (!response.ok || payload.status === "tool_error" || payload.status === "invalid_payload") {
        throw new Error(payload.error ?? payload.message ?? "验证码提交失败");
      }

      setXhsStatus({
        status: payload.loggedIn ? "logged_in" : "not_logged_in",
        message: payload.message ?? (payload.loggedIn ? "已登录" : "验证码已提交，仍未登录")
      });

      if (payload.loggedIn) {
        setXhsVerificationCode("");
        setXhsQrcode(null);
      }
    } catch (submitError) {
      setXhsError(submitError instanceof Error ? submitError.message : "验证码提交失败");
    } finally {
      setIsSubmittingXhsCode(false);
    }
  }

  async function submitRun() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/ingest/run", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          city,
          area: area.trim() || undefined,
          keywords: keywordList.length > 0 ? keywordList : ["咖啡"],
          sources: selectedSources,
          force,
          requestedBy: "admin"
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "采集任务入队失败");
      }

      setActiveRunId(payload.runId);
      await refresh(payload.runId);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "采集任务入队失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleSource(source: string) {
    setSelectedSources((current) =>
      current.includes(source)
        ? current.filter((item) => item !== source)
        : [...current, source]
    );
  }

  useEffect(() => {
    if (!activeRunId || !isRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      void refresh(activeRunId);
    }, 1500);

    return () => window.clearInterval(interval);
  }, [activeRunId, isRunning, refresh]);

  useEffect(() => {
    if (!xhsQrcode?.imageDataUrl || xhsStatus?.status === "logged_in") {
      return;
    }

    if (xhsQrcode.expiresAt && Date.now() > new Date(xhsQrcode.expiresAt).getTime()) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshXhsStatus();
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [refreshXhsStatus, xhsQrcode?.expiresAt, xhsQrcode?.imageDataUrl, xhsStatus?.status]);

  useEffect(() => {
    if (!hasDamaiConnector || damaiStatus?.status !== "active_session") {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshDamaiStatus();
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [damaiStatus?.status, hasDamaiConnector, refreshDamaiStatus]);

  return (
    <div className="source-console">
      <div className="source-control-bar">
        <div>
          <p className="eyebrow">Ingest pipeline</p>
          <h2>Source Adapter 入库流水线</h2>
        </div>
        <span className={status.queue.configured ? "queue-pill ready" : "queue-pill missing"}>
          <DatabaseZap size={15} />
          Redis {status.queue.configured ? "ready" : "missing"}
        </span>
      </div>

      <div className="xhs-login-panel">
        <div className="xhs-login-copy">
          <p className="eyebrow">Xiaohongshu MCP</p>
          <h3>小红书登录</h3>
          <span className={`xhs-login-pill ${xhsStatus?.status ?? "unknown"}`}>
            <ShieldCheck size={15} />
            {xhsStatusText(xhsStatus?.status)}
          </span>
        </div>
        <div className="xhs-login-actions">
          <button
            className="secondary-button"
            disabled={isXhsBusy}
            onClick={requestXhsQrcode}
            type="button"
          >
            {isLoadingXhsQr ? <Loader2 className="spin" size={16} /> : <QrCode size={16} />}
            登录二维码
          </button>
          <button
            className="secondary-button"
            disabled={isXhsBusy}
            onClick={() => void refreshXhsStatus()}
            type="button"
          >
            {isCheckingXhs ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            检查状态
          </button>
        </div>
        {xhsQrcode?.imageDataUrl ? (
          <div className="xhs-qr-box">
            <Image
              alt="小红书登录二维码"
              height={128}
              src={xhsQrcode.imageDataUrl}
              unoptimized
              width={128}
            />
            <p>{xhsQrcode.message ?? "请使用小红书 App 扫码登录。"}</p>
          </div>
        ) : null}
        {canSubmitXhsVerificationCode ? (
          <div className="xhs-code-form">
            <label className="field">
              <span>验证码</span>
              <input
                inputMode="numeric"
                onChange={(event) => setXhsVerificationCode(event.target.value)}
                placeholder="扫码后收到的验证码"
                value={xhsVerificationCode}
              />
            </label>
            <button
              className="secondary-button"
              disabled={!xhsVerificationCode.trim() || isXhsBusy}
              onClick={submitXhsVerificationCode}
              type="button"
            >
              {isSubmittingXhsCode ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />}
              提交验证码
            </button>
          </div>
        ) : null}
        {xhsStatus?.message ? <p className="muted-copy xhs-login-message">{xhsStatus.message}</p> : null}
        {xhsError ? <p className="inline-error">{xhsError}</p> : null}
      </div>

      {hasDamaiConnector ? (
        <div className="xhs-login-panel">
          <div className="xhs-login-copy">
            <p className="eyebrow">Damai crawler</p>
            <h3>大麦验证</h3>
            <span className={`xhs-login-pill ${damaiStatusClass(damaiStatus?.status)}`}>
              <ShieldCheck size={15} />
              {damaiStatusText(damaiStatus?.status)}
            </span>
          </div>
          <div className="xhs-login-actions">
            <button
              className="secondary-button"
              disabled={isStartingDamai}
              onClick={startDamaiSession}
              type="button"
            >
              {isStartingDamai ? <Loader2 className="spin" size={16} /> : <Ticket size={16} />}
              打开验证窗口
            </button>
            <button
              className="secondary-button"
              disabled={isSavingDamai}
              onClick={saveDamaiCookies}
              type="button"
            >
              {isSavingDamai ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
              保存匿名 Cookie
            </button>
            <button
              className="secondary-button"
              disabled={isCheckingDamai}
              onClick={() => void refreshDamaiStatus()}
              type="button"
            >
              {isCheckingDamai ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              检查状态
            </button>
          </div>
          <p className="muted-copy xhs-login-message">
            {[
              damaiStatus?.message ?? "尚未检查大麦验证状态。",
              damaiStatus?.savedAt ? `保存时间：${formatDate(damaiStatus.savedAt, mounted)}` : "",
              damaiStatus?.expiresAt ? `过期时间：${formatDate(damaiStatus.expiresAt, mounted)}` : "",
              damaiStatus?.cookieCount ? `已保存 ${damaiStatus.cookieCount} 个 cookie` : "",
              damaiStatus?.activeSession
                ? `当前窗口：${damaiStatus.activeSession.city} / ${damaiStatus.activeSession.keyword}`
                : ""
            ]
              .filter(Boolean)
              .join("\n")}
          </p>
          {damaiError ? <p className="inline-error">{damaiError}</p> : null}
        </div>
      ) : null}

      <div className="ingest-form">
        <label className="field">
          <span>城市</span>
          <input value={city} onChange={(event) => setCity(event.target.value)} />
        </label>
        <label className="field">
          <span>区域/商圈</span>
          <input value={area} onChange={(event) => setArea(event.target.value)} />
        </label>
        <label className="field">
          <span>关键词</span>
          <input value={keywords} onChange={(event) => setKeywords(event.target.value)} />
        </label>
        <label className="toggle-row">
          <input checked={force} onChange={(event) => setForce(event.target.checked)} type="checkbox" />
          <span>忽略 cooldown</span>
        </label>
      </div>

      <div className="source-picker">
        {status.connectors.map((connector) => (
          <button
            className={selectedSources.includes(connector.source) ? "source-chip active" : "source-chip"}
            key={connector.source}
            onClick={() => toggleSource(connector.source)}
            type="button"
          >
            {connector.source}
          </button>
        ))}
      </div>

      <div className="source-actions">
        <button
          className="primary-button compact"
          disabled={!status.queue.configured || selectedSources.length === 0 || isSubmitting}
          onClick={submitRun}
          type="button"
        >
          {isSubmitting ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
          触发采集
        </button>
        <button className="secondary-button" onClick={() => void refresh()} type="button">
          <RefreshCw size={16} />
          刷新状态
        </button>
      </div>

      {error ? <p className="inline-error">{error}</p> : null}

      <div className="source-table enhanced">
        <div className="source-row head">
          <span>Source</span>
          <span>类型</span>
          <span>状态</span>
          <span>最近成功</span>
          <span>错误</span>
        </div>
        {status.connectors.map((connector) => (
          <div className="source-row" key={connector.source}>
            <span>{connector.source}</span>
            <span>{connector.kind}</span>
            <span className={`status-dot ${connector.status}`}>
              {connectorIcon(connector.status)}
              {connector.enabled ? connector.status : "disabled"}
            </span>
            <span>{formatDate(connector.lastSuccessAt, mounted)}</span>
            <span>{connector.lastError ?? "-"}</span>
          </div>
        ))}
      </div>

      <div className="run-list">
        <div className="section-heading">
          <CircleDashed size={17} />
          <span>最近采集任务</span>
        </div>
        {status.recentRuns.length === 0 ? (
          <p className="muted-copy">暂无采集任务。</p>
        ) : (
          status.recentRuns.map((run) => (
            <div className="run-row" key={run.id}>
              <strong>{run.status}</strong>
              <span>{run.city}</span>
              <span>{run.sources.join(", ")}</span>
              <span>{formatDate(run.createdAt, mounted)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
