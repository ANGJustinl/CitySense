"use client";

import { useState } from "react";
import { Flame, Snowflake } from "lucide-react";
import { PreviewableImage } from "@/components/city/ImagePreview";
import type { VenueRankingEntryView, VenueVoteType } from "@/server/community/types";

function belongsToRanking(counts: { niche: number; hot: number }, type: VenueVoteType) {
  return type === "HOT" ? counts.hot > counts.niche : counts.niche > counts.hot;
}

const RANK_LABEL: Record<VenueVoteType, { verb: string; noun: string }> = {
  HOT: { verb: "投它够夯", noun: "超夯榜" },
  NICHE: { verb: "投它够小众", noun: "小众榜" }
};

function rankIcon(type: VenueVoteType) {
  return type === "HOT" ? <Flame size={16} /> : <Snowflake size={16} />;
}

export function CommunityRankingBoard({
  city,
  type,
  area,
  initialEntries,
  nextCursor,
  viewerId
}: {
  city: string;
  type: VenueVoteType;
  area?: string;
  initialEntries: VenueRankingEntryView[];
  nextCursor: string | null;
  viewerId?: string;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string>();

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ city, type, cursor });
      if (area) params.set("area", area);
      const response = await fetch(`/api/community/ranking?${params.toString()}`);
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      setEntries((current) => {
        const byId = new Map(current.map((entry) => [entry.id, entry]));
        for (const entry of data.entries as VenueRankingEntryView[]) byId.set(entry.id, entry);
        return [...byId.values()];
      });
      setCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  async function vote(entry: VenueRankingEntryView) {
    if (!viewerId) {
      const next = encodeURIComponent(`/community/ranking?city=${city}&type=${type}${area ? `&area=${area}` : ""}`);
      window.location.assign(`/login?next=${next}`);
      return;
    }
    const active = entry.viewer?.votedType === type;
    setBusyId(entry.id);
    try {
      const response = await fetch(`/api/community/venues/${entry.id}/vote`, { method: active ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: active ? undefined : JSON.stringify({ type }) });
      if (!response.ok) return;
      const result: { votedType: VenueVoteType | null; counts: { niche: number; hot: number } } = await response.json();
      setEntries((current) => current.flatMap((item) => {
        if (item.id !== entry.id) return [item];
        if (!belongsToRanking(result.counts, type)) return [];
        return [{ ...item, counts: result.counts, viewer: { votedType: result.votedType } }];
      }));
      setCursor(null);
      try {
        const params = new URLSearchParams({ city, type, limit: "20" });
        if (area) params.set("area", area);
        const refreshed = await fetch(`/api/community/ranking?${params.toString()}`);
        if (refreshed.ok) {
          const data = await refreshed.json() as { entries: VenueRankingEntryView[]; nextCursor: string | null };
          setEntries(data.entries);
          setCursor(data.nextCursor);
        }
      } catch {
        // Keep the vote response applied locally if refreshing the ranking fails.
      }
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <section className="community-hub community-ranking">
      <header className="community-section-intro community-ranking-intro">
        <p className="eyebrow">CITY RANKING · {city}</p>
        <h1>{type === "HOT" ? "此刻最夯的地方" : "还藏得很深的地方"}</h1>
        <p>{type === "HOT" ? "大家用一票一票把热度投出来。够夯，才上榜。" : "越多人说它够小众，它就越往前。趁还没火，去看看。"}</p>
      </header>

      <nav className="community-channel-strip" aria-label="榜单类型">
        <a className={type === "HOT" ? "active" : ""} href={`/community/ranking?city=${encodeURIComponent(city)}&type=HOT`}>{rankIcon("HOT")}超夯榜</a>
        <a className={type === "NICHE" ? "active" : ""} href={`/community/ranking?city=${encodeURIComponent(city)}&type=NICHE`}>{rankIcon("NICHE")}小众榜</a>
        <a href="/community">城市手记</a>
      </nav>

      {entries.length ? (
        <ol className="community-ranking-list">
          {entries.map((entry, index) => {
            const active = entry.viewer?.votedType === type;
            const count = type === "HOT" ? entry.counts.hot : entry.counts.niche;
            return (
              <li
                key={entry.id}
                className="community-post-card community-ranking-row"
                style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
              >
                <span className="community-ranking-position">{String(index + 1).padStart(2, "0")}</span>
                <div className="community-ranking-thumb">
                  <span aria-hidden="true" className="community-ranking-thumb-fallback">
                    {entry.name.trim().slice(0, 1) || "城"}
                  </span>
                  {entry.imageUrl ? (
                    <PreviewableImage
                      alt={entry.name}
                      className="community-ranking-image"
                      src={entry.imageUrl}
                      wrapperClassName="community-ranking-image-trigger"
                    />
                  ) : null}
                </div>
                <div className="community-ranking-body">
                  <strong className="community-ranking-name">{entry.name}</strong>
                  <small className="community-ranking-meta">
                    {entry.area ? `${entry.city} · ${entry.area}` : entry.city}
                    {entry.tags.length ? ` · ${entry.tags.slice(0, 3).join(" / ")}` : ""}
                  </small>
                </div>
                <div className="community-ranking-vote">
                  <span className="community-ranking-count">{count}</span>
                  <button
                    className={`community-ranking-vote-btn ${active ? "active" : ""} ${type.toLowerCase()}`}
                    onClick={() => void vote(entry)}
                    disabled={busyId === entry.id}
                    type="button"
                  >
                    {rankIcon(type)}
                    {active ? "已投" : RANK_LABEL[type].verb}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="community-ranking-empty">
          {type === "HOT"
            ? "暂时还没有地点在超夯票中胜出。投出第一票，让它登榜。"
            : "暂时还没有地点在小众票中胜出。投出第一票，让它登榜。"}
        </p>
      )}

      {cursor ? (
        <button className="community-load-more" disabled={loading} onClick={() => void loadMore()} type="button">
          {loading ? "正在翻开下一页…" : "继续翻榜"}
        </button>
      ) : null}
    </section>
  );
}
