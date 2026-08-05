"use client";

import { useState } from "react";
import { MapPin, Route, Send } from "lucide-react";

export function CommunityComposer({ defaultCity, routeSnapshotId }: { defaultCity: string; routeSnapshotId?: string }) {
  const [body, setBody] = useState("");
  const [city, setCity] = useState(defaultCity);
  const [area, setArea] = useState("");
  const [venueIds, setVenueIds] = useState("");
  const [routeId, setRouteId] = useState(routeSnapshotId ?? "");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/community/posts", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ body, city, area: area || undefined, venueIds: venueIds.split(",").map((item) => item.trim()).filter(Boolean), routeSnapshotId: routeId || undefined, publish: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "发布失败");
      location.href = `/community/posts/${result.id}`;
    } catch (error) { setStatus(error instanceof Error ? error.message : "发布失败"); setBusy(false); }
  }
  return <form className="community-composer" onSubmit={submit}><div className="community-composer-heading"><p className="eyebrow">NEW CITY NOTE</p><h1>今天，在城里遇见了什么？</h1><p>写下真实的一刻。它不必宏大，只需足够诚实。</p></div><label className="community-editor"><span>正文</span><textarea maxLength={3000} onChange={(event) => setBody(event.target.value)} placeholder="比如：傍晚六点，胡同尽头那家旧书店刚好放着一张很慢的唱片……" required value={body} /><small>{body.length} / 3000</small></label><div className="community-composer-grid"><label><span>城市</span><input onChange={(event) => setCity(event.target.value)} required value={city} /></label><label><span>区域</span><input onChange={(event) => setArea(event.target.value)} placeholder="朝阳 / 东城" value={area} /></label></div><div className="community-attachment-fields"><label><MapPin size={17} /><span><strong>关联地点</strong><small>填写已发布地点 ID，多个用逗号分隔</small></span><input onChange={(event) => setVenueIds(event.target.value)} value={venueIds} /></label><label><Route size={17} /><span><strong>关联路线</strong><small>可从路线详情页带入</small></span><input onChange={(event) => setRouteId(event.target.value)} value={routeId} /></label></div>{status ? <p className="community-form-status">{status}</p> : null}<button className="community-publish-button" disabled={busy} type="submit"><Send size={18} />{busy ? "正在写入城市…" : "发布城市手记"}</button></form>;
}
