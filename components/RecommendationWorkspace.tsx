"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  Activity,
  ChevronDown,
  Clock3,
  Crosshair,
  LocateFixed,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  SlidersHorizontal,
  TriangleAlert
} from "lucide-react";
import type {
  Budget,
  Mood,
  RecommendResponse,
  TimeWindow
} from "@/server/recommendation/types";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { DEMO_USER_PERSONA_INTERESTS } from "@/lib/demo-users";
import { CityPulsePanel } from "@/components/city/CityPulsePanel";
import { RouteInspector } from "@/components/city/RouteInspector";
import { RouteMapCanvas } from "@/components/city/RouteMapCanvas";
import { RouteTimeline } from "@/components/city/RouteTimeline";

type WorkspaceProps = {
  initialData: RecommendResponse;
  initialUserId: string;
};

/** Identifiers for the floating dock panels that can be collapsed. */
type FloatingPanelId = "controls" | "inspector" | "pulse";

const interestOptions = ["咖啡", "展览", "书店", "漫画", "独立音乐", "夜生活"];
const moodOptions: { value: Mood; label: string }[] = [
  { value: "solo", label: "Solo" },
  { value: "quiet", label: "安静" },
  { value: "lively", label: "热闹" },
  { value: "date", label: "约会" },
  { value: "random", label: "随机" }
];
const timeOptions: { value: TimeWindow; label: string }[] = [
  { value: "now", label: "现在" },
  { value: "tonight", label: "今晚" },
  { value: "weekend", label: "周末" }
];
const budgetOptions: { value: Budget; label: string }[] = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" }
];
type OriginMode = "current" | "manual";
type LocationStatus = "idle" | "locating" | "located" | "unavailable" | "blocked";
type WorkspaceOrigin = {
  lat: number;
  lng: number;
  label: string;
  address?: string;
  source: "browser" | "manual" | "default";
  provider: "amap" | "browser" | "default";
};

const defaultOrigin: WorkspaceOrigin = {
  lat: 31.224,
  lng: 121.459,
  label: "默认起点",
  source: "default",
  provider: "default"
};

function formatCoordinate(origin: Pick<WorkspaceOrigin, "lat" | "lng">) {
  return `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`;
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function RecommendationWorkspace({ initialData, initialUserId }: WorkspaceProps) {
  const [city, setCity] = useState("上海");
  const [area, setArea] = useState("");
  const [originMode, setOriginMode] = useState<OriginMode>("current");
  const [origin, setOrigin] = useState<WorkspaceOrigin>(defaultOrigin);
  const [originAddress, setOriginAddress] = useState("");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [originMessage, setOriginMessage] = useState<string | undefined>();
  const [interests, setInterests] = useState(["咖啡", "展览", "书店", "漫画", "独立音乐"]);
  const [mood, setMood] = useState<Mood>("solo");
  const [budget, setBudget] = useState<Budget>("medium");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("tonight");
  const [useRealtimeTraffic, setUseRealtimeTraffic] = useState(false);
  const [userId, setUserId] = useState(initialUserId);
  const [data, setData] = useState<RecommendResponse>(initialData);
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>(
    initialData.routes[0]?.id
  );
  const [isLoading, setIsLoading] = useState(false);
  const [collapsedPanels, setCollapsedPanels] = useState<Record<FloatingPanelId, boolean>>({
    controls: false,
    inspector: true,
    pulse: true
  });
  const [mounted, setMounted] = useState(false);

  const togglePanel = useCallback((id: FloatingPanelId) => {
    setCollapsedPanels((current) => ({ ...current, [id]: !current[id] }));
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const heatContext = useMemo(
    () => ({ city, area: area || undefined, interests, mood, budget }),
    [area, budget, city, interests, mood]
  );

  const amapRouteCount = useMemo(
    () => data.routes.filter((route) => route.traffic.provider === "amap").length,
    [data.routes]
  );
  const selectedRoute =
    data.routes.find((route) => route.id === selectedRouteId) ?? data.routes[0];
  const isEstimatedTraffic = data.meta.trafficProvider === "estimated";
  const resolvedOrigin = data.meta.origin;
  const originLabel =
    originMode === "manual"
      ? originAddress.trim() || resolvedOrigin?.label || "手动起点"
      : origin.label;
  const originStatusText = useMemo(() => {
    if (originMode === "manual") {
      if (resolvedOrigin?.status === "resolved" && resolvedOrigin.source === "manual") {
        return `${resolvedOrigin.label ?? resolvedOrigin.address ?? "手动起点"} 已定位`;
      }

      return originAddress.trim() ? "生成时解析手动起点" : "填写起点地址";
    }

    if (locationStatus === "locating") {
      return "正在定位当前位置";
    }

    if (locationStatus === "located") {
      return `${origin.label} · ${formatCoordinate(origin)}`;
    }

    if (locationStatus === "blocked") {
      return "定位未开启，使用默认起点";
    }

    if (locationStatus === "unavailable") {
      return "浏览器定位不可用，使用默认起点";
    }

    return `${origin.label} · ${formatCoordinate(origin)}`;
  }, [locationStatus, origin, originAddress, originMode, resolvedOrigin]);

  const locateBrowserOrigin = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("unavailable");
      setOrigin(defaultOrigin);
      return;
    }

    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          label: "当前位置",
          source: "browser",
          provider: "browser"
        });
        setLocationStatus("located");
        setOriginMessage(undefined);
      },
      () => {
        setLocationStatus("blocked");
        setOrigin(defaultOrigin);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5 * 60 * 1000,
        timeout: 8000
      }
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => locateBrowserOrigin(), 0);

    return () => window.clearTimeout(timer);
  }, [locateBrowserOrigin]);

  async function submitRecommendation() {
    const manualAddress = originAddress.trim();

    if (originMode === "manual" && !manualAddress) {
      setOriginMessage("请输入起点地址");
      return;
    }

    setOriginMessage(undefined);
    setIsLoading(true);

    try {
      const requestBody =
        originMode === "manual"
          ? {
              userId,
              city,
              area: area || undefined,
              originAddress: manualAddress,
              interests,
              mood,
              budget,
              timeWindow,
              useRealtimeTraffic,
              useSocialSignals: true
            }
          : {
              userId,
              city,
              area: area || undefined,
              origin: {
                lat: origin.lat,
                lng: origin.lng,
                label: origin.label,
                address: origin.address,
                source: origin.source,
                provider: origin.provider
              },
              interests,
              mood,
              budget,
              timeWindow,
              useRealtimeTraffic,
              useSocialSignals: true
            };
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error("recommend failed");
      }

      const nextData = (await response.json()) as RecommendResponse;

      setData(nextData);
      setSelectedRouteId(nextData.routes[0]?.id);
      const nextOrigin = nextData.meta.origin;

      if (
        nextOrigin?.status === "resolved" &&
        Number.isFinite(nextOrigin.lat) &&
        Number.isFinite(nextOrigin.lng)
      ) {
        setOrigin({
          lat: nextOrigin.lat as number,
          lng: nextOrigin.lng as number,
          label: nextOrigin.label ?? nextOrigin.address ?? "出发点",
          address: nextOrigin.address,
          source: nextOrigin.source ?? (originMode === "manual" ? "manual" : "default"),
          provider: nextOrigin.provider ?? "default"
        });
        setOriginMessage(undefined);
      } else if (originMode === "manual") {
        setOriginMessage("未找到该起点，已按城市级路线返回");
      }
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * 账号切换：更新 userId 后立即用新 userId 重新拉推荐，
   * 让用户看到画像差异（文艺静思 vs 热闹潮流）。
   * 不复用 submitRecommendation 闭包（它会捕获旧 userId），直接用 nextUserId fetch。
   */
  async function handleAccountChange(nextUserId: string) {
    if (nextUserId === userId) return;
    // 切换账号时同步 interests 到该 persona 的召回默认（与首页逻辑一致，
    // 让候选池从源头分化）。用户仍可手动调整兴趣标签后重新生成。
    const nextInterests = DEMO_USER_PERSONA_INTERESTS[nextUserId] ?? interests;
    setUserId(nextUserId);
    setInterests(nextInterests);
    setIsLoading(true);
    try {
      const requestBody =
        originMode === "manual"
          ? {
              userId: nextUserId,
              city,
              area: area || undefined,
              originAddress: originAddress.trim(),
              interests: nextInterests,
              mood,
              budget,
              timeWindow,
              useRealtimeTraffic,
              useSocialSignals: true
            }
          : {
              userId: nextUserId,
              city,
              area: area || undefined,
              origin: {
                lat: origin.lat,
                lng: origin.lng,
                label: origin.label,
                address: origin.address,
                source: origin.source,
                provider: origin.provider
              },
              interests: nextInterests,
              mood,
              budget,
              timeWindow,
              useRealtimeTraffic,
              useSocialSignals: true
            };
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) throw new Error("recommend failed");
      const nextData = (await response.json()) as RecommendResponse;
      setData(nextData);
      setSelectedRouteId(nextData.routes[0]?.id);
    } catch {
      // 切换失败保持原数据，不阻塞 UI。
    } finally {
      setIsLoading(false);
    }
  }

  function toggleInterest(interest: string) {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest]
    );
  }

  return (
    <main className="app-shell map-fullscreen">
      <header className="topbar floating-topbar">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Activity size={20} />
          </span>
          <div>
            <p className="eyebrow">Project CitySense</p>
            <h1>城市脉搏</h1>
          </div>
        </div>
        <nav className="top-actions" aria-label="primary">
          <AccountSwitcher currentUserId={userId} onChange={handleAccountChange} />
          <a href="/admin/sources">Sources</a>
          <a href="/discover">Discover</a>
          <a href={`/profile?userId=${userId}`}>画像</a>
        </nav>
      </header>

      <aside
        aria-label="recommendation controls"
        className="floating-panel dock-left controls-panel"
        data-collapsed={collapsedPanels.controls ? "true" : "false"}
      >
        <button
          aria-expanded={!collapsedPanels.controls}
          className="panel-toggle"
          onClick={() => togglePanel("controls")}
          type="button"
        >
          <span className="panel-toggle-label">
            <SlidersHorizontal size={16} />
            <span>推荐输入</span>
          </span>
          <ChevronDown className="panel-toggle-caret" size={16} />
        </button>
        <div className="panel-body">
          <label className="field">
            <span>城市</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </label>

          <label className="field">
            <span>区域</span>
            <input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              placeholder="全城"
            />
          </label>

          <div className="origin-control">
            <div className="section-heading compact">
              <MapPin size={16} />
              <span>出发位置</span>
            </div>
            <div className="segmented icon-segmented">
              <button
                className={originMode === "current" ? "active" : ""}
                onClick={() => setOriginMode("current")}
                type="button"
              >
                <LocateFixed size={14} />
                定位
              </button>
              <button
                className={originMode === "manual" ? "active" : ""}
                onClick={() => setOriginMode("manual")}
                type="button"
              >
                <MapPin size={14} />
                手动
              </button>
            </div>

            {originMode === "manual" ? (
              <label className="field origin-address-field">
                <span>起点</span>
                <input
                  value={originAddress}
                  onChange={(event) => {
                    setOriginAddress(event.target.value);
                    setOriginMessage(undefined);
                  }}
                  placeholder="静安寺 / 上海体育场"
                />
              </label>
            ) : (
              <div className="origin-current">
                <div>
                  <span className={`origin-dot ${locationStatus}`} />
                  <strong>{origin.label}</strong>
                  <p>{formatCoordinate(origin)}</p>
                </div>
                <button
                  className="secondary-button icon-only"
                  disabled={locationStatus === "locating"}
                  onClick={locateBrowserOrigin}
                  title="重新定位"
                  type="button"
                >
                  {locationStatus === "locating" ? (
                    <Loader2 className="spin" size={15} />
                  ) : (
                    <Crosshair size={15} />
                  )}
                </button>
              </div>
            )}

            <p className={originMessage ? "origin-status warning" : "origin-status"}>
              {originMessage ?? originStatusText}
            </p>
          </div>

          <div className="field">
            <span>兴趣</span>
            <div className="chip-grid">
              {interestOptions.map((interest) => (
                <button
                  className={interests.includes(interest) ? "chip active" : "chip"}
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  type="button"
                >
                  {interest}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>心情</span>
            <div className="segmented">
              {moodOptions.map((option) => (
                <button
                  className={mood === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => setMood(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>时间</span>
            <div className="segmented">
              {timeOptions.map((option) => (
                <button
                  className={timeWindow === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => setTimeWindow(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>预算</span>
            <div className="segmented">
              {budgetOptions.map((option) => (
                <button
                  className={budget === option.value ? "active" : ""}
                  key={option.value}
                  onClick={() => setBudget(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="toggle-row">
            <input
              checked={useRealtimeTraffic}
              onChange={(event) => setUseRealtimeTraffic(event.target.checked)}
              type="checkbox"
            />
            <span>高德实时 ETA</span>
          </label>

          <button className="primary-button" disabled={isLoading} onClick={submitRecommendation} type="button">
            {isLoading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            生成路线
          </button>
        </div>
      </aside>

      {/* Fullscreen map: RouteMapCanvas renders its own .map-canvas-panel which is
          promoted to position:fixed;inset:0 under .map-fullscreen. The metrics
          strip, timeline, and dock panels below all float over it. */}
      <div className="map-metrics floating-metrics" aria-label="recommendation pipeline metrics">
        <div>
          <MapPin size={16} />
          <span>起点</span>
          <strong>{originLabel}</strong>
        </div>
        <div className={isEstimatedTraffic ? "degraded" : ""}>
          {isEstimatedTraffic ? <TriangleAlert size={16} /> : <Navigation size={16} />}
          <span>高德 ETA</span>
          <strong>
            {isEstimatedTraffic ? "估算降级" : `${amapRouteCount}/${data.routes.length}`}
          </strong>
        </div>
        <div>
          <Navigation size={16} />
          <span>路线</span>
          <strong>{data.routes.length} 条 / {data.meta.candidateCount} 候选</strong>
        </div>
        <div>
          <Clock3 size={16} />
          <span>生成</span>
          <strong>{mounted ? formatGeneratedAt(data.meta.generatedAt) : "…"}</strong>
        </div>
      </div>

      <RouteMapCanvas
        heatContext={heatContext}
        isLoading={isLoading}
        onSelectRoute={setSelectedRouteId}
        routes={data.routes}
        selectedRouteId={selectedRoute?.id}
      />

      <div className="floating-timeline">
        <RouteTimeline route={selectedRoute} />
      </div>

      <aside
        aria-label="route inspector"
        className="floating-panel dock-right-top inspector-panel"
        data-collapsed={collapsedPanels.inspector ? "true" : "false"}
      >
        <button
          aria-expanded={!collapsedPanels.inspector}
          className="panel-toggle"
          onClick={() => togglePanel("inspector")}
          type="button"
        >
          <span className="panel-toggle-label">
            <Navigation size={16} />
            <span>路线详情</span>
          </span>
          <ChevronDown className="panel-toggle-caret" size={16} />
        </button>
        <div className="panel-body">
          <RouteInspector
            isLoading={isLoading}
            onSelectRoute={setSelectedRouteId}
            recommendationId={data.meta.recommendationId}
            routes={data.routes}
            selectedRouteId={selectedRoute?.id}
          />
        </div>
      </aside>

      <aside
        aria-label="city pulse"
        className="floating-panel dock-right-bottom pulse-panel"
        data-collapsed={collapsedPanels.pulse ? "true" : "false"}
      >
        <button
          aria-expanded={!collapsedPanels.pulse}
          className="panel-toggle"
          onClick={() => togglePanel("pulse")}
          type="button"
        >
          <span className="panel-toggle-label">
            <Activity size={16} />
            <span>城市脉动</span>
          </span>
          <ChevronDown className="panel-toggle-caret" size={16} />
        </button>
        <div className="panel-body">
          <CityPulsePanel area={area || undefined} city={city} response={data} />
        </div>
      </aside>
    </main>
  );
}
