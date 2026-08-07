"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Mail,
  MapPin,
  MessageSquareText,
  Route as RouteIcon,
  Send,
  Share2,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { BuddyAvatar, BuddyRouteLine, BuddyStatus } from "@/components/buddy/BuddyEditorial";
import { buddyModeLabel, buddyPaceLabel } from "@/lib/buddy-display";
import type { BuddyApplicationView, BuddyIntentView } from "@/server/buddy/types";

type IntentApplication = BuddyApplicationView & { version: number };
type IntentDetailView = BuddyIntentView & {
  isOwner: boolean;
  applications?: IntentApplication[];
  myApplication: string | null;
};

async function loadIntent(id: string, signal?: AbortSignal) {
  const response = await fetch(`/api/buddy/intents/${id}`, { cache: "no-store", signal });
  const result = await response.json() as IntentDetailView & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "加载失败");
  return result;
}

function formatDeparture(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

export function BuddyIntentDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<IntentDetailView>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [shareNotice, setShareNotice] = useState<string>();
  const messageRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await loadIntent(id));
      setError(undefined);
    } catch (value) {
      setError(value instanceof Error ? value.message : "加载失败");
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    void loadIntent(id, controller.signal)
      .then(setData)
      .catch((value: unknown) => {
        if (!(value instanceof DOMException && value.name === "AbortError")) {
          setError(value instanceof Error ? value.message : "加载失败");
        }
      });
    return () => controller.abort();
  }, [id]);

  async function apply() {
    if (busy) return;
    setBusy("apply");
    setError(undefined);
    try {
      const response = await fetch(`/api/buddy/intents/${id}/applications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "申请失败");
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "申请失败");
    } finally {
      setBusy(undefined);
    }
  }

  async function decide(application: IntentApplication, decision: "accept" | "reject") {
    if (busy) return;
    setBusy(application.id);
    setError(undefined);
    try {
      const response = await fetch(`/api/buddy/applications/${application.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, version: application.version }),
      });
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error ?? "操作失败");
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "操作失败");
    } finally {
      setBusy(undefined);
    }
  }

  async function share() {
    if (!data) return;
    const payload = { title: `${data.route.title}｜CitySense 同路人`, text: data.route.summary, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        setShareNotice("已打开分享");
      } else {
        await navigator.clipboard.writeText(payload.url);
        setShareNotice("链接已复制");
      }
    } catch (value) {
      if (value instanceof DOMException && value.name === "AbortError") return;
      setShareNotice("暂时无法分享");
    }
  }

  if (!data) return <div className="buddy-empty buddy-detail-loading">{error ?? "正在打开这则路线邀请…"}</div>;

  const labels = [
    buddyPaceLabel(data.preferences.hard.pace),
    ...data.preferences.soft.interests,
    ...data.preferences.soft.moods,
  ].filter(Boolean) as string[];
  const applicationPending = data.myApplication === "PENDING";
  const canApply = data.status === "ACTIVE" && !applicationPending;

  return (
    <section className="buddy-intent-editorial">
      <header className="buddy-intent-context">
        <Link href="/buddy"><ArrowLeft aria-hidden="true" size={16} />返回搭子广场</Link>
        <span><RouteIcon aria-hidden="true" size={14} />INVITATION · {data.city}</span>
        <div>
          {shareNotice ? <small role="status">{shareNotice}</small> : null}
          <button aria-label="分享这则路线邀约" onClick={() => void share()} type="button"><Share2 aria-hidden="true" size={16} /></button>
          <BuddyStatus value={data.status} />
        </div>
      </header>

      <div className="buddy-intent-layout">
        <article className="buddy-intent-document">
          <section className="buddy-intent-person">
            <BuddyAvatar profile={data.owner} size="large" />
            <div>
              <p className="buddy-folio-kicker">同行发起人</p>
              <h2>{data.owner?.displayName ?? "CitySense 用户"}</h2>
              <p>{data.owner?.bio ?? "想找一位节奏相近的人，一起走完这段城市路线。"}</p>
            </div>
            <dl>
              <div><dt>城市</dt><dd>{data.owner?.city ?? data.city}</dd></div>
              <div><dt>方式</dt><dd>{buddyModeLabel(data.mode)}</dd></div>
            </dl>
          </section>

          <header className="buddy-intent-invite">
            <p className="buddy-folio-kicker">路线邀请 · ROUTE INVITATION</p>
            <h1>{data.route.title}</h1>
            <p>{data.route.summary}</p>
          </header>

          <section className="buddy-intent-route" aria-label="路线信息">
            <BuddyRouteLine route={data.route} />
          </section>

          <section className="buddy-intent-detail-list" aria-label="同行安排">
            <div>
              <CalendarDays aria-hidden="true" size={18} />
              <span><small>出发时间</small><strong>{formatDeparture(data.departureStart)}</strong></span>
              <em>{formatTime(data.departureStart)}—{formatTime(data.departureEnd)}</em>
            </div>
            <div>
              <MapPin aria-hidden="true" size={18} />
              <span><small>集合地点</small><strong>{data.meeting?.label ?? "见面后商量"}</strong></span>
              <em>{data.meeting?.area ?? data.area ?? data.route.area ?? data.city}</em>
            </div>
            <div>
              <UsersRound aria-hidden="true" size={18} />
              <span><small>同行偏好</small><strong>{buddyPaceLabel(data.preferences.hard.pace) ?? "自在商量"}</strong></span>
              <em>{labels.slice(1, 4).join(" · ") || "尊重彼此节奏"}</em>
            </div>
          </section>

          {labels.length ? <div className="buddy-profile-labels buddy-intent-labels">{labels.slice(0, 8).map((label) => <span key={label}>{label}</span>)}</div> : null}

          <section className="buddy-intent-note">
            <MessageSquareText aria-hidden="true" size={19} />
            <div>
              <p className="buddy-folio-kicker">发起人的话</p>
              <p>{data.publicNote ?? "如果你也喜欢这条路线，欢迎先写一句话认识彼此。"}</p>
            </div>
          </section>
        </article>

        <aside className="buddy-intent-action-rail">
          {data.isOwner ? (
            <section className="buddy-applications">
              <header>
                <span><Mail aria-hidden="true" size={17} /></span>
                <div><p className="buddy-folio-kicker">同行来信</p><h2>申请与回应</h2></div>
                <b>{data.applications?.length ?? 0}</b>
              </header>
              {data.applications?.length ? data.applications.map((application) => (
                <article key={application.id}>
                  <BuddyAvatar profile={application.applicant} size="small" />
                  <div>
                    <strong>{application.applicant?.displayName ?? "一位同路人"}</strong>
                    <p>{application.message ?? "想和你一起出发。"}</p>
                    <BuddyStatus context="application" value={application.status} />
                  </div>
                  {application.status === "PENDING" ? (
                    <span className="buddy-letter-actions">
                      <button disabled={busy === application.id} onClick={() => void decide(application, "reject")} type="button"><X aria-hidden="true" size={14} />暂不同行</button>
                      <button className="accept" disabled={busy === application.id} onClick={() => void decide(application, "accept")} type="button"><Check aria-hidden="true" size={14} />接受</button>
                    </span>
                  ) : null}
                </article>
              )) : <div className="buddy-empty compact"><Mail aria-hidden="true" size={20} /><p>暂时还没有来信。</p></div>}
            </section>
          ) : (
            <form className="buddy-apply-box" onSubmit={(event) => { event.preventDefault(); void apply(); }}>
              <span className="buddy-apply-icon"><Mail aria-hidden="true" size={19} /></span>
              <div>
                <p className="buddy-folio-kicker">加入这次同行</p>
                <h2>{applicationPending ? "来信已经送达" : "先用一句话认识彼此"}</h2>
                <p>{applicationPending ? "发起人回应后，你会在“我的搭子”里看到最新状态。" : "说说你期待的节奏或喜欢这条路线的原因。"}</p>
              </div>
              <textarea
                disabled={!canApply}
                maxLength={300}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="例如：我也喜欢慢慢看展，结束后想找一家咖啡店坐坐。"
                ref={messageRef}
                value={message}
              />
              <button disabled={!canApply || busy === "apply"} type="submit"><Send aria-hidden="true" size={16} />{busy === "apply" ? "正在送达" : applicationPending ? "等待回应" : data.status === "ACTIVE" ? "申请一起出发" : "本次邀约已结束"}</button>
              <p className="buddy-apply-safety"><ShieldCheck aria-hidden="true" size={14} />公开场合见面，行程中保持必要的安全联系。</p>
            </form>
          )}
          {error ? <p className="buddy-error" role="alert">{error}</p> : null}
        </aside>
      </div>
    </section>
  );
}
