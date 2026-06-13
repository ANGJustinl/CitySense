"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, DatabaseZap, Loader2, Play, RefreshCw } from "lucide-react";
import type { IngestStatusResponse } from "@/server/ingest/status";

type SourceIngestConsoleProps = {
  initialStatus: IngestStatusResponse;
};

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("zh-CN", {
    hour12: false
  });
}

function connectorIcon(status: string) {
  return status === "active" ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />;
}

export function SourceIngestConsole({ initialStatus }: SourceIngestConsoleProps) {
  const [status, setStatus] = useState<IngestStatusResponse>(initialStatus);
  const [city, setCity] = useState("上海");
  const [keywords, setKeywords] = useState("咖啡,展览,书店");
  const [force, setForce] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>(() =>
    initialStatus.connectors.map((connector) => connector.source)
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeRun = status.run ?? status.recentRuns.find((run) => run.id === activeRunId);
  const isRunning =
    activeRun?.status === "queued" || activeRun?.status === "running" || isSubmitting;
  const keywordList = useMemo(
    () =>
      keywords
        .split(/[,\s，]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    [keywords]
  );

  const refresh = useCallback(async (runId = activeRunId) => {
    const response = await fetch(runId ? `/api/ingest/status?runId=${runId}` : "/api/ingest/status");
    setStatus((await response.json()) as IngestStatusResponse);
  }, [activeRunId]);

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

      <div className="ingest-form">
        <label className="field">
          <span>城市</span>
          <input value={city} onChange={(event) => setCity(event.target.value)} />
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
            <span>{formatDate(connector.lastSuccessAt)}</span>
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
              <span>{formatDate(run.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
