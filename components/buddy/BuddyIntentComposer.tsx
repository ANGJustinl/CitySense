"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Clock3, MapPin, Sparkles, UsersRound, X } from "lucide-react";
import type { BuddyComposeMode } from "@/lib/buddy-navigation";

type CreatedResult = { intentId: string; mode: BuddyComposeMode; matched: boolean; groupId?: string };
type Props = { routeId: string; routeTitle: string; initialMode?: BuddyComposeMode; profileReady?: boolean; profileHref?: string; onClose: () => void; onCreated?: (value: CreatedResult) => void };

function localDateTime(offsetHours: number) { const date = new Date(Date.now() + offsetHours * 3_600_000); date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0); return date.toISOString().slice(0, 16); }

export function BuddyIntentComposer({ routeId, routeTitle, initialMode = "POST", profileReady = true, profileHref = "/settings/buddy-profile", onClose, onCreated }: Props) {
  const [mode, setMode] = useState<BuddyComposeMode>(initialMode);
  const [start, setStart] = useState(localDateTime(24)); const [end, setEnd] = useState(localDateTime(27));
  const [meetingLabel, setMeetingLabel] = useState(""); const [meetingArea, setMeetingArea] = useState("");
  const [interests, setInterests] = useState("咖啡, 展览"); const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string>(); const [createdIntentId, setCreatedIntentId] = useState<string>();
  const idempotencyKey = useRef(crypto.randomUUID()); const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; dialogRef.current?.focus(); const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", close); return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", close); }; }, [onClose]);

  async function runAutoMatch(intentId: string) { const response = await fetch(`/api/buddy/intents/${intentId}/match`, { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "自动匹配暂未完成"); onCreated?.({ intentId, mode: "AUTO", matched: Boolean(result.matched), groupId: result.groupId }); onClose(); }
  async function submit() {
    if (new Date(start) <= new Date()) { setError("开始时间必须晚于现在"); return; }
    if (new Date(end) <= new Date(start)) { setError("结束时间必须晚于开始时间"); return; }
    setSaving(true); setError(undefined);
    try {
      if (createdIntentId && mode === "AUTO") { await runAutoMatch(createdIntentId); return; }
      const response = await fetch("/api/buddy/intents", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current }, body: JSON.stringify({ mode, routeSnapshotId: routeId, departureStart: new Date(start).toISOString(), departureEnd: new Date(end).toISOString(), meetingLabel, meetingArea: meetingArea || undefined, publicNote: note || undefined, preferences: { version: 1, hard: { meetingAreas: meetingArea ? [meetingArea] : [] }, soft: { interests: interests.split(/[，,]/).map((item) => item.trim()).filter(Boolean), moods: [] }, publicLabels: [mode === "POST" ? "欢迎申请" : "自动匹配"] } }) });
      const data = await response.json();
      if (!response.ok) { setError(data.code === "buddy_profile_required" ? "请先完善公开资料，再发布搭子意向" : data.code === "route_not_owned" ? "这条路线不是当前账户生成的，请返回首页重新生成" : data.error ?? "创建失败"); return; }
      const intentId = data.intent?.id; if (!intentId) throw new Error("创建结果无效");
      if (mode === "AUTO") { setCreatedIntentId(intentId); await runAutoMatch(intentId); } else { onCreated?.({ intentId, mode, matched: false }); onClose(); }
    } catch (value) { setError(value instanceof Error ? value.message : "创建失败"); } finally { setSaving(false); }
  }

  return <div className="buddy-modal-backdrop" role="presentation"><section aria-labelledby="buddy-composer-title" aria-modal="true" className="buddy-composer" ref={dialogRef} role="dialog" tabIndex={-1}>
    <button aria-label="关闭" className="buddy-composer-close" onClick={onClose} type="button"><X size={18} /></button><p className="eyebrow">Route companion</p><h2 id="buddy-composer-title">把路线变成一次相遇</h2><p className="buddy-composer-route"><Sparkles size={15} />{routeTitle}</p>
    {!profileReady ? <div className="buddy-profile-gate"><UsersRound size={30} /><h3>发布前先完善公开资料</h3><p>只展示你主动填写的昵称、城市和介绍，不公开邮箱或内部画像。</p><a className="primary-button" href={profileHref}>完善公开资料</a></div> : <><div className="buddy-mode-grid"><button aria-pressed={mode === "POST"} className={mode === "POST" ? "active" : ""} disabled={saving || Boolean(createdIntentId)} onClick={() => setMode("POST")} type="button"><UsersRound size={22} /><strong>发布组队</strong><span>让同路线的人申请加入</span></button><button aria-pressed={mode === "AUTO"} className={mode === "AUTO" ? "active" : ""} disabled={saving || Boolean(createdIntentId)} onClick={() => setMode("AUTO")} type="button"><Sparkles size={22} /><strong>自动匹配</strong><span>按时间与偏好寻找一位搭子</span></button></div>
    <div className="buddy-form-grid"><label><span><Clock3 size={14} />开始时间</span><input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></label><label><span><Clock3 size={14} />结束时间</span><input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></label><label><span><MapPin size={14} />集合地点</span><input placeholder="如：静安寺 2 号口" value={meetingLabel} onChange={(event) => setMeetingLabel(event.target.value)} /></label><label><span>集合区域</span><input placeholder="静安" value={meetingArea} onChange={(event) => setMeetingArea(event.target.value)} /></label></div><label className="buddy-wide-field"><span>想一起体验</span><input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="咖啡, 展览, 拍照" /></label><label className="buddy-wide-field"><span>给搭子的一句话</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="介绍你的节奏、期待或集合习惯" /></label>
    {error ? <div aria-live="polite" className="buddy-error"><p>{error}</p>{error.includes("公开资料") ? <a href={profileHref}>立即完善资料</a> : error.includes("重新生成") ? <Link href="/">返回首页生成路线</Link> : null}</div> : null}<button className={saving ? "primary-button buddy-submit saving" : "primary-button buddy-submit"} disabled={saving || !meetingLabel || !start || !end} onClick={submit} type="button">{saving ? "正在创建…" : createdIntentId ? "重试自动匹配" : mode === "AUTO" ? "开始自动匹配" : "发布这次组队"}</button><p className="buddy-privacy-note">仅展示公开资料与共同点；精确集合信息只对匹配成功的两人开放。</p></>}</section></div>;
}
