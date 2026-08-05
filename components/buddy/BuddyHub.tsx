"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Clock3, MapPin, Sparkles, UserRound } from "lucide-react";
import { useBuddyIntents } from "@/hooks/useBuddyIntents";

function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

export function BuddyHub({ routeId }: { routeId?: string }) {
  const { intents, mine, applications, groups, loading, error, refresh } = useBuddyIntents(routeId);
  const [tab, setTab] = useState<"discover" | "mine" | "groups">("discover");
  const cards = tab === "discover" ? intents : tab === "mine" ? [...mine, ...applications.map((item) => item.intent)] : groups;
  return <section className="buddy-hub">
    <header className="buddy-hub-hero">
      <div><p className="eyebrow">CitySense Buddy</p><h1>同一条路线，刚好两个人</h1><p>从兴趣相同到一起出发。公开组队或自动匹配，集合、聊天与安全机制都在站内完成。</p></div>
      <span className="buddy-orbit"><Sparkles size={28} /></span>
    </header>
    <div className="buddy-tabs">
      <button className={tab === "discover" ? "active" : ""} onClick={() => setTab("discover")} type="button">发现组队 <em>{intents.length}</em></button>
      <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")} type="button">我的意向 <em>{mine.length + applications.length}</em></button>
      <button className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")} type="button">我的搭子 <em>{groups.length}</em></button>
      <button className="buddy-refresh" onClick={() => void refresh()} type="button">刷新</button>
    </div>
    {loading ? <div className="buddy-empty">正在寻找同路线的人…</div> : error ? <div className="buddy-empty error">{error}</div> : cards.length === 0 ? <div className="buddy-empty">这里还很安静。先从一条推荐路线发起搭子吧。</div> : <div className="buddy-card-grid">{cards.map((item: any) => {
      const route = item.route ?? {};
      const profile = item.owner ?? item.members?.find((member: any) => member.role === "MEMBER")?.profile;
      const href = tab === "groups" ? `/buddy/groups/${item.id}` : `/buddy/intents/${item.id}`;
      return <Link className="buddy-intent-card" href={href as never} key={`${tab}-${item.id}`}>
        <div className="buddy-card-top"><span className="buddy-avatar">{profile?.displayName?.slice(0, 1) ?? <UserRound size={16} />}</span><div><strong>{profile?.displayName ?? (tab === "groups" ? "你的搭子" : "等待搭子")}</strong><small>{item.mode === "AUTO" ? "自动匹配中" : item.status}</small></div><ArrowRight size={18} /></div>
        <h2>{route.title ?? "共同路线"}</h2><p>{route.summary ?? "一起沿着这条路线出发。"}</p>
        <div className="buddy-card-meta"><span><Clock3 size={14} />{formatTime(item.departureStart)}</span><span><MapPin size={14} />{item.meeting?.area ?? item.meetingLabel ?? "匹配后可见"}</span></div>
      </Link>;
    })}</div>}
  </section>;
}
