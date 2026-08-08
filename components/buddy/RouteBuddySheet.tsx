"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Gauge,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Route as RouteIcon,
  ShieldCheck,
  Shuffle,
  Tags,
  Ticket,
  UsersRound,
  X,
} from "lucide-react";
import type { BuddyComposeMode } from "@/lib/buddy-navigation";
import { buildBuddyIntentPayload, validateBuddySchedule, type BuddyPace } from "@/lib/route-buddy";

export type RouteBuddySummary = { id: string; title: string; summary?: string; durationLabel?: string; stopCount?: number };
export type RouteBuddyCreatedResult = { intentId: string; mode: BuddyComposeMode; matched: boolean; groupId?: string };

type RouteBuddySheetProps = {
  route: RouteBuddySummary;
  viewerId?: string;
  initialMode?: BuddyComposeMode;
  profileReady?: boolean;
  profileHref?: string;
  onClose: () => void;
  onCreated?: (value: RouteBuddyCreatedResult) => void;
};

function localDateTime(offsetHours: number) {
  const date = new Date(Date.now() + offsetHours * 3_600_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function RouteBuddySheet({ route, viewerId, initialMode = "POST", profileReady, profileHref, onClose, onCreated }: RouteBuddySheetProps) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<BuddyComposeMode>(initialMode);
  const [start, setStart] = useState(localDateTime(24));
  const [end, setEnd] = useState(localDateTime(27));
  const [meetingLabel, setMeetingLabel] = useState("");
  const [meetingArea, setMeetingArea] = useState("");
  const [pace, setPace] = useState<BuddyPace>("balanced");
  const [interests, setInterests] = useState("咖啡, 展览");
  const [note, setNote] = useState("");
  const [profileState, setProfileState] = useState<"loading" | "ready" | "missing" | "error">(!viewerId ? "missing" : profileReady === true ? "ready" : profileReady === false ? "missing" : "loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const sheetRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const resolvedProfileHref = profileHref ?? `/settings/buddy-profile?next=${encodeURIComponent(`/buddy?routeId=${route.id}&compose=${mode}`)}`;
  const scheduleError = useMemo(() => validateBuddySchedule(start, end), [start, end]);

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (!viewerId || profileReady !== undefined) return;
    let cancelled = false;
    fetch("/api/buddy/profile", { cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
      .then((result) => { if (!cancelled) setProfileState(result.profile ? "ready" : "missing"); })
      .catch(() => { if (!cancelled) setProfileState("error"); });
    return () => { cancelled = true; };
  }, [profileReady, viewerId]);

  async function runAutoMatch(intentId: string) {
    const response = await fetch(`/api/buddy/intents/${intentId}/match`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "自动匹配暂未完成");
    onCreated?.({ intentId, mode: "AUTO", matched: Boolean(result.matched), groupId: result.groupId });
  }

  async function submit() {
    const validation = validateBuddySchedule(start, end);
    if (validation) { setError(validation); setStep(2); return; }
    if (!meetingLabel.trim()) { setError("请填写集合地点"); setStep(2); return; }
    setSaving(true);
    setError(undefined);
    try {
      const response = await fetch("/api/buddy/intents", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify(buildBuddyIntentPayload({ mode, routeId: route.id, start, end, meetingLabel, meetingArea, interests, note, pace })),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.code === "buddy_profile_required" ? "请先完善公开资料" : result.error ?? "创建失败");
      const intentId = result.intent?.id as string | undefined;
      if (!intentId) throw new Error("创建结果无效");
      if (mode === "AUTO") await runAutoMatch(intentId);
      else onCreated?.({ intentId, mode, matched: false });
      onClose();
    } catch (value) {
      setError(value instanceof Error ? value.message : "创建失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  const pageNames = ["选择方式", "时间地点", "同行小志"];

  return (
    <div className="route-buddy-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
      <section aria-labelledby="route-buddy-title" aria-modal="true" className="route-buddy-sheet" ref={sheetRef} role="dialog">
        <div className="route-buddy-handle" />
        <header>
          <div><p className="buddy-folio-kicker">ROUTE COMPANION · PAGE {String(step).padStart(2, "0")}</p><h2 id="route-buddy-title">把路线写成一次相遇</h2></div>
          <button aria-label="关闭找搭子" onClick={onClose} ref={closeRef} type="button"><X aria-hidden="true" size={19} /></button>
        </header>
        <ol aria-label={`步骤 ${step}，共 3 步`} className="route-buddy-pages">
          {pageNames.map((name, index) => <li aria-current={step === index + 1 ? "step" : undefined} className={step >= index + 1 ? "active" : ""} key={name}><span>{String(index + 1).padStart(2, "0")}</span>{name}</li>)}
        </ol>

        {!viewerId ? (
          <div className="route-buddy-gate"><ShieldCheck aria-hidden="true" size={34} /><h3>登录后，重新生成属于你的路线</h3><p>搭子意向只关联登录账户生成的路线，避免别人替你发起行程。</p><Link className="product-button primary" href={`/login?next=${encodeURIComponent("/")}`}>登录并返回路线</Link></div>
        ) : profileState === "loading" ? (
          <div className="route-buddy-gate"><LoaderCircle aria-hidden="true" className="spin" size={28} /><p>正在确认你的公开资料…</p></div>
        ) : profileState !== "ready" ? (
          <div className="route-buddy-gate"><UsersRound aria-hidden="true" size={34} /><h3>{profileState === "error" ? "公开资料暂时无法读取" : "发布前先介绍一下自己"}</h3><p>只展示你主动填写的昵称、城市和介绍，不公开邮箱或内部画像。</p><Link className="product-button primary" href={resolvedProfileHref as Route}>完善公开资料</Link></div>
        ) : (
          <>
            {step === 1 ? (
              <div className="route-buddy-step route-buddy-opening">
                <div className="route-buddy-ticket"><span><Ticket aria-hidden="true" size={15} />本期路线</span><h3>{route.title}</h3><p>{route.summary ?? "沿着同一条路线，一起出发。"}</p><small>{[route.durationLabel, route.stopCount ? `${route.stopCount} 站` : undefined].filter(Boolean).join(" · ")}</small></div>
                <div className="route-buddy-modes">
                  <button aria-pressed={mode === "POST"} className={mode === "POST" ? "active" : ""} onClick={() => setMode("POST")} type="button"><UsersRound aria-hidden="true" size={23} /><strong>公开组队</strong><span>让走同一路线的人写信申请</span></button>
                  <button aria-pressed={mode === "AUTO"} className={mode === "AUTO" ? "active" : ""} onClick={() => setMode("AUTO")} type="button"><Shuffle aria-hidden="true" size={23} /><strong>自动匹配</strong><span>按时间、区域和节奏寻找一位搭子</span></button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="route-buddy-step">
                <div className="route-buddy-section-heading"><Clock3 aria-hidden="true" size={19} /><div><h3>约定出发的时刻</h3><p>把可见的时间与集合区域写清楚，具体地点会按现有隐私规则展示。</p></div></div>
                <div className="route-buddy-field-grid">
                  <label><span><Clock3 aria-hidden="true" size={15} />开始时间</span><input min={localDateTime(1)} onChange={(event) => setStart(event.target.value)} type="datetime-local" value={start} /></label>
                  <label><span><Clock3 aria-hidden="true" size={15} />结束时间</span><input min={start} onChange={(event) => setEnd(event.target.value)} type="datetime-local" value={end} /></label>
                  <label><span><MapPin aria-hidden="true" size={15} />集合地点</span><input onChange={(event) => setMeetingLabel(event.target.value)} placeholder="例如：静安寺 2 号口" value={meetingLabel} /></label>
                  <label><span><RouteIcon aria-hidden="true" size={15} />集合区域</span><input onChange={(event) => setMeetingArea(event.target.value)} placeholder="例如：静安" value={meetingArea} /></label>
                </div>
                {scheduleError ? <p className="product-error">{scheduleError}</p> : null}
              </div>
            ) : null}

            {step === 3 ? (
              <div className="route-buddy-step">
                <fieldset className="route-buddy-pace"><legend><Gauge aria-hidden="true" size={16} />想用什么节奏走</legend>{([
                  { value: "relaxed", label: "慢慢走", copy: "留足停留和聊天时间" },
                  { value: "balanced", label: "自在逛", copy: "松弛但不错过重点" },
                  { value: "fast", label: "高效打卡", copy: "按计划完成整条路线" },
                ] as const).map((option) => <button aria-pressed={pace === option.value} className={pace === option.value ? "active" : ""} key={option.value} onClick={() => setPace(option.value)} type="button"><strong>{option.label}</strong><span>{option.copy}</span></button>)}</fieldset>
                <label className="route-buddy-wide-field"><span><Tags aria-hidden="true" size={15} />想一起体验</span><input onChange={(event) => setInterests(event.target.value)} placeholder="咖啡, 展览, 拍照" value={interests} /></label>
                <label className="route-buddy-wide-field"><span><MessageSquareText aria-hidden="true" size={15} />给搭子的一句话</span><textarea maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder="介绍你的节奏、期待或集合习惯" value={note} /></label>
                <div className="route-buddy-review"><Check aria-hidden="true" size={18} /><span><strong>{mode === "AUTO" ? "自动匹配" : "公开组队"}</strong><small>{new Date(start).toLocaleString("zh-CN")} · {meetingLabel || "待填写集合点"}</small></span></div>
              </div>
            ) : null}

            {error ? <p className="route-buddy-error" role="alert">{error}</p> : null}
            <footer>
              {step > 1 ? <button className="product-button quiet" disabled={saving} onClick={() => { setError(undefined); setStep((value) => value - 1); }} type="button"><ArrowLeft aria-hidden="true" size={17} />上一页</button> : <span />}
              {step < 3 ? <button className="product-button primary" disabled={step === 2 && Boolean(scheduleError)} onClick={() => { setError(undefined); setStep((value) => value + 1); }} type="button">下一页<ArrowRight aria-hidden="true" size={17} /></button> : <button className="product-button primary" disabled={saving} onClick={() => void submit()} type="button">{saving ? "正在创建…" : mode === "AUTO" ? "开始自动匹配" : "刊出这次组队"}</button>}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
