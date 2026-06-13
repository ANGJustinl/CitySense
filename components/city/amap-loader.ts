export type AMapMap = {
  add: (overlays: unknown[] | unknown) => void;
  remove: (overlays: unknown[] | unknown) => void;
  addControl: (control: unknown) => void;
  setFitView: (overlays?: unknown[], immediately?: boolean, avoid?: number[]) => void;
  destroy: () => void;
};

export type AMapNamespace = {
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
  Scale: new () => unknown;
  ToolBar: new () => unknown;
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
  }
}

let loaderPromise: Promise<void> | null = null;

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
    plugins: ["AMap.Scale", "AMap.ToolBar"]
  });

  if (!AMap) {
    throw new Error("AMap namespace unavailable");
  }

  return AMap;
}
