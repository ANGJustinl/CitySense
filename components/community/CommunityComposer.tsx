"use client";

import { useEffect, useState } from "react";
import { Clock3, MapPin, Route, Save, Send, X } from "lucide-react";
import Link from "next/link";
import { communityDraftKey, parseCommunityDraft, serializeCommunityDraft } from "@/lib/community-draft";

type SelectedVenue = { id: string; name: string; area: string | null };
type InitialRoute = { id: string; title: string; summary: string };

type VenueSearchHit = {
  id: string;
  name: string;
  city: string;
  area: string | null;
  address: string | null;
};

export function CommunityComposer({ defaultCity, initialRoute, initialRouteError, viewerId }: { defaultCity: string; initialRoute?: InitialRoute; initialRouteError?: string; viewerId: string }) {
  const [body, setBody] = useState("");
  const [city, setCity] = useState(defaultCity);
  const [area, setArea] = useState("");
  const [selectedVenues, setSelectedVenues] = useState<SelectedVenue[]>([]);
  const [route, setRoute] = useState(initialRoute);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileRequired, setProfileRequired] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string>();

  // 地点搜索状态
  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState<VenueSearchHit[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draft = parseCommunityDraft(localStorage.getItem(communityDraftKey(viewerId)));
      if (draft) {
        setBody(draft.body);
        setCity(draft.city || defaultCity);
        setArea(draft.area);
        setSelectedVenues(draft.venues);
        setDraftSavedAt(draft.savedAt);
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [defaultCity, viewerId]);

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => {
      if (!body.trim() && !area.trim() && selectedVenues.length === 0) {
        localStorage.removeItem(communityDraftKey(viewerId));
        setDraftSavedAt(undefined);
        return;
      }
      const savedAt = new Date();
      localStorage.setItem(communityDraftKey(viewerId), serializeCommunityDraft({ body, city, area, venues: selectedVenues }, savedAt));
      setDraftSavedAt(savedAt.toISOString());
    }, 450);
    return () => window.clearTimeout(timer);
  }, [area, body, city, draftReady, selectedVenues, viewerId]);
  // 防抖搜索：输入变化后 300ms 触发查询
  useEffect(() => {
    const term = venueQuery.trim();
    if (term.length < 1) return;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ query: term });
        if (city) params.set("city", city);
        const res = await fetch(`/api/community/venues/search?${params.toString()}`);
        const data = await res.json();
        if (res.ok) {
          // 过滤掉已选中的，避免重复添加
          setVenueResults((data.venues ?? []).filter((v: VenueSearchHit) => !selectedVenues.some((s) => s.id === v.id)));
        } else {
          setVenueResults([]);
        }
      } catch {
        setVenueResults([]);
      } finally {
        setVenueSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [venueQuery, city, selectedVenues]);

  function addVenue(hit: VenueSearchHit) {
    if (selectedVenues.length >= 3) return;
    setSelectedVenues((current) => (current.some((v) => v.id === hit.id) ? current : [...current, { id: hit.id, name: hit.name, area: hit.area }]));
    setVenueQuery("");
    setVenueResults([]);
  }

  function removeVenue(id: string) {
    setSelectedVenues((current) => current.filter((v) => v.id !== id));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          body,
          city,
          area: area || undefined,
          venueIds: selectedVenues.map((v) => v.id),
          routeSnapshotId: route?.id,
          publish: true
        })
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "profile_required") setProfileRequired(true);
        throw new Error(result.error ?? "发布失败");
      }
      localStorage.removeItem(communityDraftKey(viewerId));
      location.href = `/community/posts/${result.id}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "发布失败");
      setBusy(false);
    }
  }

  return (
    <form className="community-composer" onSubmit={submit}>
      <div className="community-composer-heading">
        <div><p className="eyebrow">NEW CITY NOTE · 编辑台</p><h1>今天，在城里遇见了什么？</h1><p>先写现场，再补充地点与路线。它不必宏大，只需足够诚实。</p></div>
        <span className="community-draft-state"><Save aria-hidden="true" size={14} />{draftSavedAt ? `已自动保存 ${new Date(draftSavedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "内容将在本机自动保存"}</span>
      </div>
      <div className="community-composer-workspace">
        <label className="community-editor">
          <span>正文</span>
          <textarea maxLength={3000} onChange={(event) => setBody(event.target.value)} placeholder="比如：傍晚六点，胡同尽头那家旧书店刚好放着一张很慢的唱片……" required value={body} />
          <small>{body.length} / 3000</small>
        </label>
        <aside className="community-composer-notes">
          <header><p className="eyebrow">EDITOR&apos;S NOTES</p><strong>内容注脚</strong></header>
          <div className="community-composer-grid">
            <label><span>城市</span><input onChange={(event) => setCity(event.target.value)} required value={city} /></label>
            <label><span>区域</span><input onChange={(event) => setArea(event.target.value)} placeholder="朝阳 / 东城" value={area} /></label>
          </div>
        <div className="community-venue-picker">
          <span className="community-venue-picker-label"><MapPin size={17} /><strong>关联地点</strong><small>搜索地点名添加，最多 3 个</small></span>
          {selectedVenues.length > 0 ? (
            <div className="community-venue-chips">
              {selectedVenues.map((venue) => (
                <span className="community-venue-chip" key={venue.id}>
                  {venue.name}{venue.area ? ` · ${venue.area}` : ""}
                  <button type="button" onClick={() => removeVenue(venue.id)} aria-label={`移除 ${venue.name}`}><X size={13} /></button>
                </span>
              ))}
            </div>
          ) : null}
          {selectedVenues.length < 3 ? (
            <div className="community-venue-search">
              <input
                onChange={(event) => {
                  const value = event.target.value;
                  setVenueQuery(value);
                  if (value.trim()) setVenueSearching(true);
                  else { setVenueSearching(false); setVenueResults([]); }
                }}
                placeholder="输入地点名搜索，如「咖啡馆」「书店」"
                value={venueQuery}
                type="text"
              />
              {venueSearching ? <small className="community-venue-search-hint">搜索中…</small> : null}
              {venueResults.length > 0 ? (
                <ul className="community-venue-results">
                  {venueResults.map((hit) => (
                    <li key={hit.id}>
                      <button type="button" onClick={() => addVenue(hit)}>
                        <strong>{hit.name}</strong>
                        <small>{hit.area ? `${hit.city} · ${hit.area}` : hit.city}{hit.address ? ` · ${hit.address}` : ""}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
          {route ? (
            <div className="community-route-ticket">
              <Route aria-hidden="true" size={18} />
              <span><small>关联路线</small><strong>{route.title}</strong><em>{route.summary}</em></span>
              <button aria-label="移除关联路线" onClick={() => setRoute(undefined)} type="button"><X size={15} /></button>
            </div>
          ) : (
            <Link className="community-route-guide" href="/"><Route aria-hidden="true" size={17} /><span><strong>关联一条路线</strong><small>{initialRouteError ?? "请从路线详情页选择“分享到社区”带入"}</small></span></Link>
          )}
        </aside>
      </div>
      {status ? <div className="community-form-status" role="alert"><p>{status}</p>{profileRequired ? <a href="/settings/buddy-profile?next=%2Fcommunity%2Fnew">完善公开资料后继续</a> : null}</div> : null}
      <footer className="community-composer-footer"><span><Clock3 aria-hidden="true" size={14} />公开发布 · 发布后进入社区审核</span><button className="community-publish-button" disabled={busy} type="submit"><Send size={18} />{busy ? "正在写入城市…" : "发布城市手记"}</button></footer>
    </form>
  );
}
