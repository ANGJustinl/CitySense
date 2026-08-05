"use client";

import { useState } from "react";
import { Clock3, MapPin, Sparkles, UsersRound, X } from "lucide-react";

function localDateTime(offsetHours: number) {
  const date = new Date(Date.now() + offsetHours * 3_600_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return date.toISOString().slice(0, 16);
}

export function BuddyIntentComposer({ routeId, routeTitle, onClose, onCreated }: { routeId: string; routeTitle: string; onClose: () => void; onCreated?: (value: any) => void }) {
  const [mode, setMode] = useState<"POST" | "AUTO">("POST");
  const [start, setStart] = useState(localDateTime(24));
  const [end, setEnd] = useState(localDateTime(27));
  const [meetingLabel, setMeetingLabel] = useState("");
  const [meetingArea, setMeetingArea] = useState("");
  const [interests, setInterests] = useState("咖啡, 展览");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    setSaving(true); setError(undefined);
    try {
      const response = await fetch("/api/buddy/intents", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ mode, routeSnapshotId: routeId, departureStart: new Date(start).toISOString(), departureEnd: new Date(end).toISOString(), meetingLabel, meetingArea: meetingArea || undefined, publicNote: note || undefined, preferences: { version: 1, hard: { meetingAreas: meetingArea ? [meetingArea] : [] }, soft: { interests: interests.split(/[，,]/).map((item) => item.trim()).filter(Boolean), moods: [] }, publicLabels: [mode === "POST" ? "欢迎申请" : "自动匹配"] } })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "创建失败");
      onCreated?.(data); onClose();
    } catch (value) { setError(value instanceof Error ? value.message : "创建失败"); }
    finally { setSaving(false); }
  }

  return <div className="buddy-modal-backdrop" role="presentation">
    <section aria-labelledby="buddy-composer-title" aria-modal="true" className="buddy-composer" role="dialog">
      <button aria-label="关闭" className="buddy-composer-close" onClick={onClose} type="button"><X size={18} /></button>
      <p className="eyebrow">Route companion</p>
      <h2 id="buddy-composer-title">把路线变成一次相遇</h2>
      <p className="buddy-composer-route"><Sparkles size={15} />{routeTitle}</p>
      <div className="buddy-mode-grid">
        <button className={mode === "POST" ? "active" : ""} onClick={() => setMode("POST")} type="button"><UsersRound size={22} /><strong>发布组队</strong><span>让同路线的人申请加入</span></button>
        <button className={mode === "AUTO" ? "active" : ""} onClick={() => setMode("AUTO")} type="button"><Sparkles size={22} /><strong>自动匹配</strong><span>按时间与偏好寻找一位搭子</span></button>
      </div>
      <div className="buddy-form-grid">
        <label><span><Clock3 size={14} />开始时间</span><input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label><span><Clock3 size={14} />结束时间</span><input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        <label><span><MapPin size={14} />集合地点</span><input placeholder="如：静安寺 2 号口" value={meetingLabel} onChange={(event) => setMeetingLabel(event.target.value)} /></label>
        <label><span>集合区域</span><input placeholder="静安" value={meetingArea} onChange={(event) => setMeetingArea(event.target.value)} /></label>
      </div>
      <label className="buddy-wide-field"><span>想一起体验</span><input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="咖啡, 展览, 拍照" /></label>
      <label className="buddy-wide-field"><span>给搭子的一句话</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="介绍你的节奏、期待或集合习惯" /></label>
      {error ? <p className="buddy-error">{error}</p> : null}
      <button className="primary-button buddy-submit" disabled={saving || !meetingLabel || !start || !end} onClick={submit} type="button">{saving ? "正在创建…" : mode === "AUTO" ? "开始自动匹配" : "发布这次组队"}</button>
      <p className="buddy-privacy-note">仅展示公开资料与共同点；精确集合信息只对匹配成功的两人开放。</p>
    </section>
  </div>;
}
