"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Flag, Link2, LogOut, MapPin, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { BuddyAvatar, BuddyRouteLine, BuddyStatus } from "@/components/buddy/BuddyEditorial";
import { useBuddyMessages } from "@/hooks/useBuddyMessages";
import type { BuddyPublicProfileView, BuddyRouteView } from "@/server/buddy/types";

type BuddyGroupMemberClient = {
  id: string;
  userId: string;
  role: string;
  user?: { buddyProfile?: BuddyPublicProfileView | null } | null;
};

type BuddyGroupClientView = {
  id: string;
  status: string;
  version: number;
  routeSnapshot?: BuddyRouteView;
  meetingLabel: string;
  departureStart: string;
  members: BuddyGroupMemberClient[];
};

export function BuddyGroupClient({ id, viewerId }: { id: string; viewerId: string }) {
  const [group, setGroup] = useState<BuddyGroupClientView>();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const { messages, error: messageError, send } = useBuddyMessages(id);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/buddy/groups/${id}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { group?: BuddyGroupClientView; error?: string };
        if (!response.ok || !result.group) throw new Error(result.error ?? "加载失败");
        return result.group;
      })
      .then(setGroup)
      .catch((value: unknown) => { if (!(value instanceof DOMException && value.name === "AbortError")) setError(value instanceof Error ? value.message : "加载失败"); });
    return () => controller.abort();
  }, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    try { await send(body); }
    catch { setText(body); setError("消息发送失败"); }
  }

  async function leave() {
    if (!group) return;
    const response = await fetch(`/api/buddy/groups/${id}/leave`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: group.version }) });
    if (response.ok) location.reload();
  }

  async function report() {
    const other = group?.members.find((member) => member.userId !== viewerId) ?? group?.members[0];
    if (!other) return;
    await fetch("/api/buddy/reports", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ reportedUserId: other.userId, groupId: id, category: "OTHER", detail: "用户从搭子行程页提交举报", blockUser: true, leaveGroup: true }) });
    location.reload();
  }

  if (!group) return <div className="buddy-empty buddy-group-loading">{error ?? "正在打开共同路线…"}</div>;

  return (
    <section className="buddy-group-editorial">
      <header className="buddy-editorial-backbar buddy-group-heading">
        <Link href="/buddy"><ArrowLeft aria-hidden="true" size={16} />返回我的搭子</Link>
        <div><p className="buddy-folio-kicker">SHARED JOURNEY · 共同路线</p><h1>{group.routeSnapshot?.title ?? "两个人的城市行程"}</h1></div>
        <BuddyStatus context="group" value={group.status} />
      </header>

      <div className="buddy-group-spread">
        <aside className="buddy-group-plan">
          <div className="buddy-member-pair">
            {group.members.map((member) => <BuddyAvatar key={member.id} profile={member.user?.buddyProfile} size="large" />)}
            <Link2 aria-hidden="true" size={17} />
          </div>
          <p className="buddy-folio-kicker">TRAVEL FOLIO 01</p>
          <h2>两个人的城市切片</h2>
          <p>{group.routeSnapshot?.summary ?? "沿着同一条路线，一起出发。"}</p>
          {group.routeSnapshot ? <BuddyRouteLine route={group.routeSnapshot} /> : null}
          <div className="buddy-meeting-card">
            <MapPin aria-hidden="true" size={18} />
            <span>集合地点</span>
            <strong>{group.meetingLabel}</strong>
            <small>{new Date(group.departureStart).toLocaleString("zh-CN")}</small>
          </div>
          <div className="buddy-safety-note"><ShieldCheck aria-hidden="true" size={17} /><p>站内沟通并在公共地点集合。遇到不适，可以随时退出或举报。</p></div>
          <div className="buddy-safety-actions"><button onClick={() => void leave()} type="button"><LogOut aria-hidden="true" size={15} />退出行程</button><button onClick={() => void report()} type="button"><Flag aria-hidden="true" size={15} />举报并拉黑</button></div>
        </aside>

        <section className="buddy-chat">
          <header><div><p className="buddy-folio-kicker">MARGIN NOTES</p><h2>沿途来信</h2></div><MessageCircle aria-hidden="true" size={22} /></header>
          <div aria-live="polite" className="buddy-message-list">
            {messages.length ? messages.map((message) => {
              const own = message.senderId === viewerId;
              const profile = message.sender?.buddyProfile;
              return <article className={own ? "own" : ""} key={message.id}><BuddyAvatar name={profile?.displayName} profile={profile} size="small" /><div><strong>{own ? "我" : profile?.displayName ?? "搭子"}</strong><p>{message.body}</p><time>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></div></article>;
            }) : <div className="buddy-chat-empty"><MessageCircle aria-hidden="true" size={25} /><p>从确认集合细节开始，写下你们的第一条消息。</p></div>}
          </div>
          <form className="buddy-chat-form" onSubmit={submit}>
            <textarea aria-label="发送给搭子的消息" disabled={group.status !== "ACTIVE"} maxLength={2000} onChange={(event) => setText(event.target.value)} placeholder={group.status === "ACTIVE" ? "确认集合细节，或聊聊对路线的期待…" : "行程已结束，聊天记录只读"} value={text} />
            <button aria-label="发送消息" disabled={!text.trim() || group.status !== "ACTIVE"} type="submit"><Send aria-hidden="true" size={17} /></button>
          </form>
          {error || messageError ? <p className="buddy-error" role="alert">{error ?? messageError}</p> : null}
        </section>
      </div>
    </section>
  );
}
