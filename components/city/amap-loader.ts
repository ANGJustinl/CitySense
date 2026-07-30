export type AMapMap = {
  add: (overlays: unknown[] | unknown) => void;
  remove: (overlays: unknown[] | unknown) => void;
  addControl: (control: unknown) => void;
  setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void;
  destroy: () => void;
};

export type AMapHeatMapLayer = {
  setDataSet: (data: { data: unknown[]; max: number }) => void;
  show: () => void;
  hide: () => void;
  setMap: (map: AMapMap | null) => void;
};

export type AMapOverlay = {
  show?: () => void;
  hide?: () => void;
  setMap?: (map: AMapMap | null) => void;
};

export type LocaHexagonLayer = {
  setSource?: (source: unknown, options?: Record<string, unknown>) => void;
  setOptions?: (options: Record<string, unknown>) => void;
  setStyle?: (options: Record<string, unknown>) => void;
  setData?: (data: unknown[], options: Record<string, unknown>) => void;
  show: () => void;
  hide: () => void;
  destroy: () => void;
};

export type LocaContainer = {
  add: (layer: unknown) => void;
  remove: (layer: unknown) => void;
  destroy?: () => void;
  requestRender?: () => void;
  render?: () => void;
};

export type LocaNamespace = {
  Container: new (options: { map: AMapMap }) => LocaContainer;
  HexagonLayer: new (options?: Record<string, unknown>) => LocaHexagonLayer;
  GeoJSONSource?: new (options: Record<string, unknown>) => unknown;
};

export type AMapNamespace = {
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
  CircleMarker: new (options: Record<string, unknown>) => AMapOverlay;
  Scale: new () => unknown;
  ToolBar: new () => unknown;
  HeatMap: new (map: AMapMap, options: Record<string, unknown>) => AMapHeatMapLayer;
};

export type AMapEventTarget = {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
};

type AMapLoaderGlobal = {
  load: (options: {
    key: string;
    version: string;
    plugins?: string[];
  }) => Promise<AMapNamespace>;
};

declare global {
  interface Window {
    AMapLoader?: AMapLoaderGlobal;
    _AMapSecurityConfig?: {
      securityJsCode: string;
    };
    Loca?: unknown;
  }
}

let loaderPromise: Promise<void> | null = null;
let locaPromise: Promise<void> | null = null;
let locaKey = "";

function ensureAmapLoaderScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window is unavailable"));
  }

  if (window.AMapLoader) {
    return Promise.resolve();
  }

  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://webapi.amap.com/loader.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("AMap loader failed"));
      document.head.appendChild(script);
    });
  }

  return loaderPromise;
}

function ensureLocaScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window is unavailable"));
  }

  const existingLoca = typeof window.Loca === "object" && window.Loca !== null
    ? (window.Loca as Record<string, unknown>)
    : null;

  if (
    existingLoca &&
    typeof existingLoca.Container === "function" &&
    typeof existingLoca.HexagonLayer === "function"
  ) {
    return Promise.resolve();
  }

  if (existingLoca) {
    window.Loca = undefined;
    locaPromise = null;
  }

  if (!locaPromise) {
    locaPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/loca?v=2.0&key=${encodeURIComponent(locaKey)}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Loca loader failed"));
      document.head.appendChild(script);
    });
  }

  return locaPromise;
}

export async function loadAmap(options: {
  key: string;
  securityJsCode?: string;
}): Promise<AMapNamespace> {
  if (options.securityJsCode) {
    window._AMapSecurityConfig = {
      securityJsCode: options.securityJsCode
    };
  }

  await ensureAmapLoaderScript();

  const AMap = await window.AMapLoader?.load({
    key: options.key,
    version: "2.0",
    plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.HeatMap"]
  });

  if (!AMap) {
    throw new Error("AMap namespace unavailable");
  }

  return AMap;
}

/**
 * 加载 Loca 数据可视化命名空间，用于 HexagonLayer 蜂窝图。
 * Loca v2.0 是独立脚本，依赖已加载的 AMap JS API key。
 */
export async function loadLoca(options: { key: string }): Promise<LocaNamespace> {
  locaKey = options.key;
  await ensureLocaScript();

  const raw = window.Loca;
  const Loca = typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)
    : null;

  if (!Loca || typeof Loca.Container !== "function" || typeof Loca.HexagonLayer !== "function") {
    throw new Error("Loca namespace unavailable");
  }

  return Loca as unknown as LocaNamespace;
}
