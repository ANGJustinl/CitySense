"use client";

import { useState } from "react";
import { Flame, Snowflake } from "lucide-react";
import type { VenueRankingEntryView, VenueVoteType } from "@/server/community/types";

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
      setEntries((current) => [...current, ...data.entries]);
      setCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  async function vote(entry: VenueRankingEntryView) {
    if (!viewerId) {
      const next = encodeURIComponent(`/community/ranking?city=${city}&type=${type}${area ? `&area=${area}` : ""}`);
      location.href = `/login?next=${next}`;
      return;
    }
    const active = entry.viewer?.votedType === type;
    setBusyId(entry.id);
    try {
      const response = await fetch(`/api/community/venues/${entry.id}/vote`, { method: active ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: active ? undefined : JSON.stringify({ type }) });
      if (!response.ok) return;
      const result: { votedType: VenueVoteType | null; counts: { niche: number; hot: number } } = await response.json();
      setEntries((current) => current.map((item) => (item.id === entry.id ? { ...item, counts: result.counts, viewer: { votedType: result.votedType } } : item)));
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
        <p className="community-ranking-empty">还没有人投票。第一个投出「{RANK_LABEL[type].noun}」的人，会是你吗？</p>
      )}

      {cursor ? (
        <button className="community-load-more" disabled={loading} onClick={() => void loadMore()} type="button">
          {loading ? "正在翻开下一页…" : "继续翻榜"}
        </button>
      ) : null}
    </section>
  );
}
