"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Route, Send, X } from "lucide-react";

type SelectedVenue = { id: string; name: string; area: string | null };

type VenueSearchHit = {
  id: string;
  name: string;
  city: string;
  area: string | null;
  address: string | null;
};

export function CommunityComposer({ defaultCity, routeSnapshotId }: { defaultCity: string; routeSnapshotId?: string }) {
  const [body, setBody] = useState("");
  const [city, setCity] = useState(defaultCity);
  const [area, setArea] = useState("");
  const [selectedVenues, setSelectedVenues] = useState<SelectedVenue[]>([]);
  const [routeId, setRouteId] = useState(routeSnapshotId ?? "");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // 地点搜索状态
  const [venueQuery, setVenueQuery] = useState("");
  const [venueResults, setVenueResults] = useState<VenueSearchHit[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 防抖搜索：输入变化后 300ms 触发查询
  useEffect(() => {
    const term = venueQuery.trim();
    if (term.length < 1) {
      setVenueResults([]);
      setVenueSearching(false);
      return;
    }
    setVenueSearching(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
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
    return () => clearTimeout(debounceRef.current);
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
          routeSnapshotId: routeId || undefined,
          publish: true
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "发布失败");
      location.href = `/community/posts/${result.id}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "发布失败");
      setBusy(false);
    }
  }

  return (
    <form className="community-composer" onSubmit={submit}>
      <div className="community-composer-heading">
        <p className="eyebrow">NEW CITY NOTE</p>
        <h1>今天，在城里遇见了什么？</h1>
        <p>写下真实的一刻。它不必宏大，只需足够诚实。</p>
      </div>
      <label className="community-editor">
        <span>正文</span>
        <textarea maxLength={3000} onChange={(event) => setBody(event.target.value)} placeholder="比如：傍晚六点，胡同尽头那家旧书店刚好放着一张很慢的唱片……" required value={body} />
        <small>{body.length} / 3000</small>
      </label>
      <div className="community-composer-grid">
        <label><span>城市</span><input onChange={(event) => setCity(event.target.value)} required value={city} /></label>
        <label><span>区域</span><input onChange={(event) => setArea(event.target.value)} placeholder="朝阳 / 东城" value={area} /></label>
      </div>
      <div className="community-attachment-fields">
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
                onChange={(event) => setVenueQuery(event.target.value)}
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
        <label><Route size={17} /><span><strong>关联路线</strong><small>可从路线详情页带入</small></span><input onChange={(event) => setRouteId(event.target.value)} value={routeId} /></label>
      </div>
      {status ? <p className="community-form-status">{status}</p> : null}
      <button className="community-publish-button" disabled={busy} type="submit"><Send size={18} />{busy ? "正在写入城市…" : "发布城市手记"}</button>
    </form>
  );
}
