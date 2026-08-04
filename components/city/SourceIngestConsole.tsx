"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  CloudSun,
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
import type { CityConditionStatus } from "@/server/city-state/types";
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

type CityStateRefreshResponse = {
  status?: "queued";
  jobId?: string;
  city?: string;
  area?: string;
  queuedAt?: string;
  error?: string;
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

function conditionTitle(condition: string) {
  if (condition === "weather") return "天气";
  if (condition === "crowd") return "人流";
  if (condition === "sentiment") return "情绪";
  if (condition === "freshness") return "新鲜度";
  return condition;
}

function sourceCountsText(items: { source: string; count: number }[]) {
  return items.length > 0
    ? items.map((item) => `${item.source}: ${item.count}`).join(" / ")
    : "-";
}

function healthStatusText(status: IngestStatusResponse["health"]["overall"]) {
  if (status === "ready") return "可推荐";
  if (status === "blocked") return "阻塞";
  return "降级";
}

function healthIssueTitle(code: string) {
  if (code === "redis_missing") return "队列缺失";
  if (code === "source_auth_required") return "需要验证";
  if (code === "source_error") return "来源失败";
  if (code === "raw_backlog") return "Raw 堆积";
  if (code === "raw_failed") return "解析失败";
  if (code === "normalize_stale") return "Normalize 过旧";
  if (code === "city_state_stale") return "城市状态过旧";
  if (code === "no_recent_success") return "缺少近期成功";
  return code;
}

function impactText(impact: string) {
  if (impact === "high") return "高影响";
  if (impact === "medium") return "中影响";
  return "低影响";
}

export function SourceIngestConsole({ initialStatus }: SourceIngestConsoleProps) {
  const [status, setStatus] = useState<IngestStatusResponse>(initialStatus);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setMounted(true), 0);

    return () => window.clearTimeout(timeout);
  }, []);
  const [xhsStatus, setXhsStatus] = useState<XhsLoginStatus | null>(null);
  const [xhsQrcode, setXhsQrcode] = useState<XhsLoginQrcode | null>(null);
  const [xhsVerificationCode, setXhsVerificationCode] = useState("");
  const [damaiStatus, setDamaiStatus] = useState<DamaiSessionStatus | null>(null);
  const [cityStateStatus, setCityStateStatus] = useState<CityConditionStatus | null>(null);
  const [cityStateMessage, setCityStateMessage] = useState<string | null>(null);
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
  const [cityStateError, setCityStateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingXhsQr, setIsLoadingXhsQr] = useState(false);
  const [isCheckingXhs, setIsCheckingXhs] = useState(false);
  const [isSubmittingXhsCode, setIsSubmittingXhsCode] = useState(false);
  const [isStartingDamai, setIsStartingDamai] = useState(false);
  const [isSavingDamai, setIsSavingDamai] = useState(false);
  const [isCheckingDamai, setIsCheckingDamai] = useState(false);
  const [isSubmittingCityState, setIsSubmittingCityState] = useState(false);
  const [isCheckingCityState, setIsCheckingCityState] = useState(false);
  const isRefreshingXhsStatusRef = useRef(false);
  const isRefreshingDamaiStatusRef = useRef(false);
  const isRefreshingCityStateRef = useRef(false);

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
  const health = status.health;

  const refresh = useCallback(async (runId = activeRunId) => {
    const response = await fetch(runId ? `/api/ingest/status?runId=${runId}` : "/api/ingest/status");
    setStatus((await response.json()) as IngestStatusResponse);
  }, [activeRunId]);

  const refreshCityStateStatus = useCallback(async () => {
    if (isRefreshingCityStateRef.current) {
      return;
    }

    isRefreshingCityStateRef.current = true;
    setIsCheckingCityState(true);
    setCityStateError(null);

    try {
      const params = new URLSearchParams({
        city
      });

      if (area.trim()) {
        params.set("area", area.trim());
      }

      const response = await fetch(`/api/city-state/status?${params.toString()}`);
      const payload = (await response.json()) as CityConditionStatus;

      if (!response.ok) {
        throw new Error("城市状态读取失败");
      }

      setCityStateStatus(payload);
    } catch (statusError) {
      setCityStateError(statusError instanceof Error ? statusError.message : "城市状态读取失败");
    } finally {
      isRefreshingCityStateRef.current = false;
      setIsCheckingCityState(false);
    }
  }, [area, city]);

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

  async function submitCityStateRefresh() {
    setIsSubmittingCityState(true);
    setCityStateError(null);
    setCityStateMessage(null);

    try {
      const response = await fetch("/api/city-state/refresh", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          city,
          area: area.trim() || undefined,
          force,
          requestedBy: "admin"
        })
      });
      const payload = (await response.json()) as CityStateRefreshResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "城市状态刷新入队失败");
      }

      setCityStateMessage(payload.jobId ? `刷新任务已入队：${payload.jobId}` : "刷新任务已入队");
      await refreshCityStateStatus();
    } catch (refreshError) {
      setCityStateError(refreshError instanceof Error ? refreshError.message : "城市状态刷新入队失败");
    } finally {
      setIsSubmittingCityState(false);
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

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void refreshCityStateStatus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [mounted, refreshCityStateStatus]);

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

      <div className={`ingest-health-summary ${health.overall}`}>
        <div className="ingest-health-head">
          <div>
            <p className="eyebrow">Trust health</p>
            <h3>采集可信状态</h3>
          </div>
          <span className={`ingest-health-pill ${health.overall}`}>
            <ShieldCheck size={15} />
            {healthStatusText(health.overall)}
          </span>
        </div>
        <div className="pulse-mini-grid">
          <div>
            <span>最近采集</span>
            <strong>{formatDate(health.pipelineHealth.latestRunAt, mounted)}</strong>
          </div>
          <div>
            <span>最近成功</span>
            <strong>{formatDate(health.pipelineHealth.latestSuccessAt, mounted)}</strong>
          </div>
          <div>
            <span>最近 Normalize</span>
            <strong>{formatDate(health.pipelineHealth.latestNormalizedAt, mounted)}</strong>
          </div>
          <div>
            <span>城市状态</span>
            <strong>{formatDate(health.pipelineHealth.latestCityStateAt, mounted)}</strong>
          </div>
        </div>
        {health.issues.length > 0 ? (
          <div className="health-issue-list">
            {health.issues.slice(0, 5).map((issue) => (
              <div className={`health-issue ${issue.severity}`} key={`${issue.code}-${issue.source ?? "pipeline"}`}>
                <strong>{issue.source ? `${issue.source} · ${healthIssueTitle(issue.code)}` : healthIssueTitle(issue.code)}</strong>
                <span>{issue.message}</span>
                <em>{issue.action}</em>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-copy">采集、解析、城市状态和来源验证均处于可推荐状态。</p>
        )}
        <div className="health-source-grid">
          {health.sourceHealth.map((source) => (
            <div className={source.requiresAuth || source.failedRaw > 0 || source.stale ? "health-source-card warn" : "health-source-card"} key={source.source}>
              <div>
                <strong>{source.source}</strong>
                <span>{impactText(source.recommendationImpact)}</span>
              </div>
              <em>{source.status}</em>
              <span>待解析 {source.pendingRaw} / 失败 {source.failedRaw}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="normalization-health-panel">
        <div className="pulse-mini-grid">
          <div>
            <span>待解析 Raw</span>
            <strong>{status.normalization.pendingRaw}</strong>
          </div>
          <div>
            <span>失败 Raw</span>
            <strong>{status.normalization.failedRaw}</strong>
          </div>
          <div>
            <span>最近 Normalize</span>
            <strong>{formatDate(status.normalization.lastNormalizedAt, mounted)}</strong>
          </div>
        </div>
        <div className="normalization-source-grid">
          <div>
            <span>待解析来源</span>
            <strong>{sourceCountsText(status.normalization.pendingBySource)}</strong>
          </div>
          <div>
            <span>失败来源</span>
            <strong>{sourceCountsText(status.normalization.failedBySource)}</strong>
          </div>
        </div>
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

      <div className="city-state-admin-panel">
        <div className="xhs-login-copy">
          <p className="eyebrow">City state</p>
          <h3>城市状态刷新</h3>
          <span className={cityStateStatus?.queue.configured ? "queue-pill ready" : "queue-pill missing"}>
            <CloudSun size={15} />
            Worker {cityStateStatus?.queue.configured ? "ready" : "missing"}
          </span>
        </div>
        <div className="pulse-mini-grid">
          <div>
            <span>城市</span>
            <strong>{cityStateStatus?.city ?? city}</strong>
          </div>
          <div>
            <span>区域</span>
            <strong>{cityStateStatus?.area ?? (area || "-")}</strong>
          </div>
          <div>
            <span>最近刷新</span>
            <strong>{formatDate(cityStateStatus?.latestCapturedAt, mounted)}</strong>
          </div>
          <div>
            <span>年龄</span>
            <strong>
              {cityStateStatus?.latestAgeMinutes === undefined
                ? "-"
                : `${cityStateStatus.latestAgeMinutes} min`}
            </strong>
          </div>
        </div>
        <div className="condition-admin-grid">
          {cityStateStatus?.conditions.length ? (
            cityStateStatus.conditions.map((condition) => (
              <div className={condition.expired ? "condition-admin-card expired" : "condition-admin-card"} key={condition.condition}>
                <span>{conditionTitle(condition.condition)}</span>
                <strong>{condition.label}</strong>
                <em>{condition.score} / {Math.round(condition.confidence * 100)}%</em>
              </div>
            ))
          ) : (
            <p className="muted-copy">暂无城市状态快照。</p>
          )}
        </div>
        <div className="source-actions">
          <button
            className="primary-button compact"
            disabled={cityStateStatus?.queue.configured === false || isSubmittingCityState}
            onClick={submitCityStateRefresh}
            type="button"
          >
            {isSubmittingCityState ? <Loader2 className="spin" size={17} /> : <CloudSun size={17} />}
            刷新城市状态
          </button>
          <button className="secondary-button" disabled={isCheckingCityState} onClick={() => void refreshCityStateStatus()} type="button">
            {isCheckingCityState ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            检查状态
          </button>
        </div>
        {cityStateMessage ? <p className="muted-copy">{cityStateMessage}</p> : null}
        {cityStateError ? <p className="inline-error">{cityStateError}</p> : null}
      </div>

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
