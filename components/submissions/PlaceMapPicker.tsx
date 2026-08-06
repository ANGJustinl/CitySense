"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, LocateFixed, Loader2, MapPin, RotateCcw } from "lucide-react";
import { loadAmap, type AMapMap, type AMapMarker, type AMapNamespace } from "@/components/city/amap-loader";

export type PlaceCoordinate = { lat: number; lng: number };
export type PlaceMapStatus = "loading" | "ready" | "unavailable" | "error";

type Props = { value?: PlaceCoordinate; onChange: (value: PlaceCoordinate) => void };

const BEIJING_CENTER: [number, number] = [116.4074, 39.9042];
const GEOLOCATION_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 300_000, timeout: 8_000 };

export function PlaceMapPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const namespaceRef = useRef<AMapNamespace | null>(null);
  const markerRef = useRef<AMapMarker | null>(null);
  const initialCenterRef = useRef<[number, number]>(BEIJING_CENTER);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<PlaceMapStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string>();
  const jsApiKey = process.env.NEXT_PUBLIC_AMAP_JS_API_KEY;
  const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  function placeMarker(coordinate: PlaceCoordinate) {
    const map = mapRef.current;
    const AMap = namespaceRef.current;
    if (!map || !AMap) return;
    map.setCenter([coordinate.lng, coordinate.lat]);
    if (markerRef.current) markerRef.current.setPosition([coordinate.lng, coordinate.lat]);
    else { markerRef.current = new AMap.Marker({ position: [coordinate.lng, coordinate.lat], anchor: "bottom-center" }); map.add(markerRef.current); }
    onChangeRef.current(coordinate);
  }

  function locateMe() {
    if (!navigator.geolocation) { setLocationMessage("当前浏览器不支持定位，请直接点击地图选点。"); return; }
    setLocating(true); setLocationMessage(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) => { const coordinate = { lng: Number(position.coords.longitude.toFixed(6)), lat: Number(position.coords.latitude.toFixed(6)) }; initialCenterRef.current = [coordinate.lng, coordinate.lat]; placeMarker(coordinate); setLocating(false); },
      () => { setLocating(false); setLocationMessage("没有获取到当前位置，可以直接点击地图选点。"); },
      GEOLOCATION_OPTIONS
    );
  }

  useEffect(() => {
    if (!jsApiKey || !containerRef.current) { setStatus("unavailable"); return; }
    let cancelled = false;
    setStatus("loading");
    void loadAmap({ key: jsApiKey, securityJsCode }).then((AMap) => {
      if (cancelled || !containerRef.current) return;
      const map = new AMap.Map(containerRef.current, { center: initialCenterRef.current, zoom: 14, viewMode: "2D" });
      namespaceRef.current = AMap; mapRef.current = map;
      const handleClick = (...args: unknown[]) => { const event = args[0] as { lnglat?: { getLng?: () => number; getLat?: () => number } }; const lng = event.lnglat?.getLng?.(); const lat = event.lnglat?.getLat?.(); if (!Number.isFinite(lng) || !Number.isFinite(lat)) return; placeMarker({ lng: Number((lng as number).toFixed(6)), lat: Number((lat as number).toFixed(6)) }); };
      map.on("click", handleClick); setStatus("ready");
      if (value) placeMarker(value);
      return () => map.off("click", handleClick);
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; markerRef.current?.setMap?.(null); markerRef.current = null; namespaceRef.current = null; mapRef.current?.destroy(); mapRef.current = null; };
  // The map should only be recreated when the API load attempt changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, jsApiKey, securityJsCode]);

  useEffect(() => { if (value && mapRef.current && namespaceRef.current) placeMarker(value); }, [value]);

  if (!jsApiKey) return <div className="submit-place-map-fallback"><MapPin size={22} /><div><strong>地图定位暂不可用</strong><p>没关系，系统会根据城市和详细地址继续处理。</p></div></div>;

  return <div className="submit-place-map-picker"><div aria-label="可选地图定位区域" className="submit-place-map-canvas" ref={containerRef} /><div className="submit-place-map-toolbar"><button className="submit-place-map-locate" disabled={locating || status !== "ready"} onClick={locateMe} type="button"><LocateFixed size={14} />{locating ? "定位中…" : "使用当前位置"}</button><span>{value ? "已标记，可再次点击调整" : "点击地图标记地点或入口"}</span></div>{status === "loading" ? <div aria-live="polite" className="submit-place-map-state"><Loader2 className="spin" size={17} />地图加载中</div> : null}{status === "error" ? <div aria-live="polite" className="submit-place-map-state error"><span>地图加载失败，仍可按地址提交</span><button onClick={() => setAttempt((current) => current + 1)} type="button"><RotateCcw size={13} />重试</button></div> : null}{status === "unavailable" ? <div aria-live="polite" className="submit-place-map-state"><Crosshair size={15} />地图不可用，可跳过定位</div> : null}{locationMessage ? <p className="submit-place-map-location-message" role="status">{locationMessage}</p> : null}</div>;
}
