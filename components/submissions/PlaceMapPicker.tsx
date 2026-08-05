"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, RotateCcw } from "lucide-react";
import { loadAmap, type AMapMap, type AMapMarker, type AMapNamespace } from "@/components/city/amap-loader";

export type PlaceCoordinate = { lat: number; lng: number };
export type PlaceMapStatus = "loading" | "ready" | "unavailable" | "error";

type Props = {
  value?: PlaceCoordinate;
  needsConfirmation?: boolean;
  onChange: (value: PlaceCoordinate) => void;
  onStatusChange?: (status: PlaceMapStatus) => void;
};

const BEIJING_CENTER: [number, number] = [116.4074, 39.9042];
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 300_000,
  timeout: 8_000
};

export function PlaceMapPicker({ value, needsConfirmation, onChange, onStatusChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const namespaceRef = useRef<AMapNamespace | null>(null);
  const markerRef = useRef<AMapMarker | null>(null);
  const initialCenterRef = useRef<[number, number]>(BEIJING_CENTER);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<PlaceMapStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const jsApiKey = process.env.NEXT_PUBLIC_AMAP_JS_API_KEY;
  const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onStatusChange?.(status); }, [onStatusChange, status]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const center: [number, number] = [position.coords.longitude, position.coords.latitude];
        initialCenterRef.current = center;
        mapRef.current?.setCenter(center);
      },
      () => {
        // Location is optional; keep Beijing as the map fallback.
      },
      GEOLOCATION_OPTIONS
    );
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!jsApiKey || !containerRef.current) {
      setStatus("unavailable");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    void loadAmap({ key: jsApiKey, securityJsCode }).then((AMap) => {
      if (cancelled || !containerRef.current) return;
      const map = new AMap.Map(containerRef.current, {
        center: initialCenterRef.current,
        zoom: 14,
        viewMode: "2D"
      });
      namespaceRef.current = AMap;
      mapRef.current = map;
      const handleClick = (...args: unknown[]) => {
        const event = args[0] as { lnglat?: { getLng?: () => number; getLat?: () => number } };
        const lng = event.lnglat?.getLng?.();
        const lat = event.lnglat?.getLat?.();
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        const coordinate = { lng: Number((lng as number).toFixed(6)), lat: Number((lat as number).toFixed(6)) };
        if (!markerRef.current) {
          markerRef.current = new AMap.Marker({ position: [coordinate.lng, coordinate.lat], anchor: "bottom-center" });
          map.add(markerRef.current);
        } else markerRef.current.setPosition([coordinate.lng, coordinate.lat]);
        onChangeRef.current(coordinate);
      };
      map.on("click", handleClick);
      setStatus("ready");
      return () => map.off("click", handleClick);
    }).catch(() => {
      if (!cancelled) setStatus("error");
    });
    return () => {
      cancelled = true;
      markerRef.current?.setMap?.(null);
      markerRef.current = null;
      namespaceRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [attempt, jsApiKey, securityJsCode]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = namespaceRef.current;
    if (!map || !AMap || !value) return;
    map.setCenter([value.lng, value.lat]);
    if (markerRef.current) markerRef.current.setPosition([value.lng, value.lat]);
    else {
      markerRef.current = new AMap.Marker({ position: [value.lng, value.lat], anchor: "bottom-center" });
      map.add(markerRef.current);
    }
  }, [value]);

  if (!jsApiKey) {
    return <div className="submission-map-fallback"><MapPin size={22} /><strong>地图暂时不可用</strong><p>仍可继续提交，系统会根据详细地址定位。</p></div>;
  }

  return (
    <div className="submission-map-picker">
      <div className="submission-map-canvas" ref={containerRef} />
      {status === "loading" ? <div className="submission-map-state"><Loader2 className="spin" size={18} />地图加载中</div> : null}
      {status === "error" ? <div className="submission-map-state error"><span>地图加载失败，可按地址继续提交</span><button onClick={() => setAttempt((value) => value + 1)} type="button"><RotateCcw size={13} />重试</button></div> : null}
      {status === "ready" ? <div className={needsConfirmation ? "submission-map-hint warning" : "submission-map-hint"}><Crosshair size={14} />{needsConfirmation ? "地址已修改，请在地图上重新确认" : value ? "位置已标记，可再次点击调整" : "点击地图标记地点或入口"}</div> : null}
    </div>
  );
}
