"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ChevronDown,
  Crosshair,
  LocateFixed,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  SlidersHorizontal
} from "lucide-react";
import type {
  Budget,
  Mood,
  RecommendResponse,
  TimeWindow
} from "@/server/recommendation/types";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import type { AuthViewer } from "@/components/auth/AuthNavigation";
import { ProductHeader } from "@/components/ProductHeader";
import { RouteInspector } from "@/components/city/RouteInspector";
import { RouteActionBar } from "@/components/city/RouteActionBar";
import { RouteFeedbackPrompt } from "@/components/city/RouteFeedbackPrompt";
import { RouteMapCanvas } from "@/components/city/RouteMapCanvas";
import { ChatDrawer } from "@/components/assistant/ChatDrawer";
import { RouteBuddySheet } from "@/components/buddy/RouteBuddySheet";
import { DEFAULT_DEMO_USER_ID, DEMO_USER_PERSONA_INTERESTS } from "@/lib/demo-users";
import { getDistrictsForCity } from "@/lib/city-districts";

type WorkspaceProps = {
  initialData: RecommendResponse;
  /** 页面传入的用户 ID（来自 URL ?userId=），兼容 initialUserId 别名。 */
  userId?: string;
  initialUserId?: string;
  viewer?: AuthViewer;
  ugcEnabled?: boolean;
};

/** Identifiers for the floating dock panels that can be collapsed. */
type RouteSheetSnap = "peek" | "mid" | "full";

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

/**
 * TASK-P2-002:稳定匿名 sessionId 生成器(模块级外部状态)。
 * 仅在事件处理器/请求体内调用,不参与 render,避免 React 纯净规则与 hydration 不匹配。
 * 同一客户端模块实例内复用同一 sessionId,作为匿名画像 key。
 */
let cachedAnonymousSessionId: string | undefined;

function getAnonymousSessionId() {
  if (!cachedAnonymousSessionId) {
    cachedAnonymousSessionId = `anon-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }

  return cachedAnonymousSessionId;
}
type WorkspaceOrigin = {
  lat: number;
  lng: number;
  label: string;
  address?: string;
  source: "browser" | "manual" | "default";
  provider: "amap" | "browser" | "default";
};

const defaultOrigin: WorkspaceOrigin = {
  lat: 39.9087,
  lng: 116.3974,
  label: "默认起点",
  source: "default",
  provider: "default"
};

function formatCoordinate(origin: Pick<WorkspaceOrigin, "lat" | "lng">) {
  return `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`;
}

export function RecommendationWorkspace({ initialData, userId, initialUserId, viewer = null, ugcEnabled = false }: WorkspaceProps) {
  // 兼容 main 的 initialUserId prop 和 ai-assistant 的 userId prop。
  const initialResolvedUserId = viewer?.id ?? userId ?? initialUserId ?? DEFAULT_DEMO_USER_ID;
  const [activeUserId, setActiveUserId] = useState(initialResolvedUserId);
  const resolvedUserId = viewer?.id ?? activeUserId;
  const [chatOpen, setChatOpen] = useState(false);
  const [city, setCity] = useState("北京");
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
  const [waypointCount, setWaypointCount] = useState(3); // 途径点数量
  const [data, setData] = useState<RecommendResponse>(initialData);
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>(
    initialData.routes[0]?.id
  );
  const [isLoading, setIsLoading] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [routeSheetSnap, setRouteSheetSnap] = useState<RouteSheetSnap>("mid");
  const [buddyOpen, setBuddyOpen] = useState(false);
  const routeDragRef = useRef<{ y: number; snap: RouteSheetSnap; dragged: boolean } | undefined>(undefined);

  const cycleRouteSheet = useCallback(() => {
    const drag = routeDragRef.current;
    if (drag?.dragged) { routeDragRef.current = undefined; return; }
    setRouteSheetSnap((value) => value === "peek" ? "mid" : value === "mid" ? "full" : "peek");
  }, []);

  const finishRouteDrag = useCallback((clientY: number) => {
    const drag = routeDragRef.current;
    if (!drag) return;
    const delta = clientY - drag.y;
    if (Math.abs(delta) >= 42) {
      const order: RouteSheetSnap[] = ["peek", "mid", "full"];
      const currentIndex = order.indexOf(drag.snap);
      const nextIndex = Math.max(0, Math.min(order.length - 1, currentIndex + (delta < 0 ? 1 : -1)));
      setRouteSheetSnap(order[nextIndex]);
      setInspectorOpen(true);
      drag.dragged = true;
    }
  }, []);

  // 区域预选：根据当前城市动态生成区列表。未知城市回退自由文本输入。
  const districtOptions = useMemo(() => getDistrictsForCity(city), [city]);

  const changeCity = useCallback((nextCity: string) => {
    setCity(nextCity);
    if (area && getDistrictsForCity(nextCity).length > 0 && !getDistrictsForCity(nextCity).includes(area)) setArea("");
  }, [area]);

  const heatContext = useMemo(
    () => ({ city, area: area || undefined, interests, mood, budget }),
    [area, budget, city, interests, mood]
  );

  const selectedRoute =
    data.routes.find((route) => route.id === selectedRouteId) ?? data.routes[0];
  const resolvedOrigin = data.meta.origin;
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
              userId: resolvedUserId,
              sessionId: resolvedUserId ? undefined : getAnonymousSessionId(),
              city,
              area: area || undefined,
              originAddress: manualAddress,
              interests,
              mood,
              budget,
              timeWindow,
              waypointCount,
              useRealtimeTraffic,
              useSocialSignals: true
            }
          : {
              userId: resolvedUserId,
              sessionId: resolvedUserId ? undefined : getAnonymousSessionId(),
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
              waypointCount,
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

  async function handleAccountChange(nextUserId: string) {
    if (nextUserId === activeUserId) return;

    const nextInterests = DEMO_USER_PERSONA_INTERESTS[nextUserId] ?? interests;

    setActiveUserId(nextUserId);
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
              waypointCount,
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
              waypointCount,
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
      <ProductHeader active="routes" assistantOpen={chatOpen} city={city} contextAction={viewer ? null : <AccountSwitcher currentUserId={activeUserId} onChange={handleAccountChange} />} onAssistantToggle={() => setChatOpen((value) => !value)} variant="map" viewer={viewer} />

      <aside
        aria-label="recommendation controls"
        className="floating-panel dock-left controls-panel"
        data-collapsed={controlsCollapsed ? "true" : "false"}
      >
        <button
          aria-expanded={!controlsCollapsed}
          className="panel-toggle"
          onClick={() => setControlsCollapsed((value) => !value)}
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
            <input value={city} onChange={(event) => changeCity(event.target.value)} />
          </label>

          <div className="field">
            <span>区域</span>
            {districtOptions.length > 0 ? (
              <div className="chip-grid area-chips">
                <button
                  className={area === "" ? "chip active" : "chip"}
                  key="all"
                  onClick={() => setArea("")}
                  type="button"
                >
                  全城
                </button>
                {districtOptions.map((district) => (
                  <button
                    className={area === district ? "chip active" : "chip"}
                    key={district}
                    onClick={() => setArea(district)}
                    type="button"
                  >
                    {district}
                  </button>
                ))}
              </div>
            ) : (
              <input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                placeholder="全城"
              />
            )}
          </div>

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

          <div className="field">
            <span>途径点数量</span>
            <div className="segmented">
              {[2, 3, 4, 5, 6].map((count) => (
                <button
                  className={waypointCount === count ? "active" : ""}
                  key={count}
                  onClick={() => setWaypointCount(count)}
                  type="button"
                >
                  {count}点
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
      <RouteMapCanvas
        heatContext={heatContext}
        isLoading={isLoading}
        onSelectRoute={setSelectedRouteId}
        routes={data.routes}
        selectedRouteId={selectedRoute?.id}
        ugcEnabled={ugcEnabled}
        userVenueContext={{ city, area: area || undefined }}
        viewportInsets={{ desktop: [84, 500, 80, controlsCollapsed ? 72 : 330], tablet: [76, 440, 70, 34], mobile: [64, 24, 380, 24] }}
      />

      <aside
        aria-label="route inspector"
        className="commercial-route-panel"
        data-open={inspectorOpen ? "true" : "false"}
        data-snap={routeSheetSnap}
      >
        <div className="commercial-route-panel-head">
          <button aria-label="拖动或点击切换路线面板高度" className="route-sheet-handle" onClick={cycleRouteSheet} onPointerDown={(event) => { routeDragRef.current = { y: event.clientY, snap: routeSheetSnap, dragged: false }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const drag = routeDragRef.current; if (drag && Math.abs(event.clientY - drag.y) >= 42) drag.dragged = true; }} onPointerUp={(event) => finishRouteDrag(event.clientY)} type="button"><span /></button>
          <span><Navigation size={16} />今晚的路线</span>
          <button aria-expanded={inspectorOpen} aria-label={inspectorOpen ? "收起路线面板" : "展开路线面板"} onClick={() => setInspectorOpen((value) => !value)} type="button"><ChevronDown size={18} /></button>
        </div>
        <div className="commercial-route-panel-scroll">
          <RouteInspector
            isLoading={isLoading}
            onSelectRoute={setSelectedRouteId}
            routes={data.routes}
            selectedRouteId={selectedRoute?.id}
          />
          {selectedRoute ? <RouteFeedbackPrompt key={`feedback-${selectedRoute.id}`} onRecorded={() => undefined} recommendationId={data.meta.recommendationId} routeId={selectedRoute.id} userId={viewer?.id} /> : null}
          {selectedRoute ? <a className="commercial-route-detail-link" href={`/routes/${selectedRoute.id}`}>打开独立路线页<Navigation size={15} /></a> : null}
          {selectedRoute && viewer ? <a className="commercial-route-community-link compact" href={`/community/new?routeId=${encodeURIComponent(selectedRoute.id)}&city=${encodeURIComponent(city)}`}>把路线写成城市手记</a> : null}
        </div>
        {selectedRoute ? <RouteActionBar canBuddy={Boolean(viewer)} key={`actions-${selectedRoute.id}`} onBuddyRequest={() => setBuddyOpen(true)} recommendationId={data.meta.recommendationId} route={selectedRoute} userId={viewer?.id} /> : null}
      </aside>
      {buddyOpen && selectedRoute ? <RouteBuddySheet onClose={() => setBuddyOpen(false)} onCreated={(result) => { window.location.href = result.groupId ? `/buddy/groups/${result.groupId}` : `/buddy?routeId=${encodeURIComponent(selectedRoute.id)}&tab=mine`; }} route={{ id: selectedRoute.id, title: selectedRoute.title, summary: selectedRoute.summary, durationLabel: `${selectedRoute.traffic.estimatedDurationMinutes} 分钟`, stopCount: selectedRoute.places.length }} viewerId={viewer?.id} /> : null}
      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        sessionId={resolvedUserId || getAnonymousSessionId()}
        context={{
          profileKey: resolvedUserId,
          recommendationId: data.meta.recommendationId,
          city,
          area: area || undefined
        }}
      />
    </main>
  );
}
