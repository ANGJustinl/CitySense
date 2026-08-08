"use client";

import type { Route as AppRoute } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Compass,
  FileText,
  MapPin,
  MessageCircle,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
  Shuffle,
  UserRoundCheck,
  UserRoundPen,
  UsersRound,
} from "lucide-react";
import {
  BuddyAvatar,
  BuddyRouteFacts,
  BuddyRouteLine,
  BuddyStatus,
} from "@/components/buddy/BuddyEditorial";
import { RouteBuddySheet, type RouteBuddyCreatedResult } from "@/components/buddy/RouteBuddySheet";
import {
  buddyModeLabel,
  buddyPaceLabel,
  buddyRouteMeta,
  buddyTabHref,
  summarizeBuddyStops,
} from "@/lib/buddy-display";
import { parseBuddyTab, type BuddyComposeMode, type BuddyHubTab } from "@/lib/buddy-navigation";
import type { BuddyPublicProfileView, BuddyRouteView, BuddyIntentView } from "@/server/buddy/types";
import { useBuddyIntents, type BuddyDashboardGroup } from "@/hooks/useBuddyIntents";

export type BuddyPublishRoute =
  | { status: "ready"; route: BuddyRouteView }
  | { status: "not-owned" | "missing"; id: string; title?: string };

type Props = {
  route?: BuddyPublishRoute;
  initialCompose?: BuddyComposeMode;
  initialTab?: BuddyHubTab;
  profileReady: boolean;
  viewerId: string;
};

function formatDeparture(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BuddyLabels({ intent }: { intent: BuddyIntentView }) {
  const labels = [
    buddyPaceLabel(intent.preferences.hard.pace),
    ...intent.preferences.soft.interests,
    ...intent.preferences.soft.moods,
  ].filter(Boolean).slice(0, 3) as string[];

  if (!labels.length) return null;
  return <div className="buddy-card-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>;
}

function BuddyRoutePath({ route }: { route: BuddyRouteView }) {
  const summary = summarizeBuddyStops(route.stops, 4);
  return (
    <ol className="buddy-inline-route" aria-label={`路线站点：${route.stops.map((stop) => stop.name).join("、")}`}>
      {summary.visible.map((stop) => <li key={stop.id}><i aria-hidden="true" /><span>{stop.name}</span></li>)}
      {summary.remaining > 0 ? <li className="more"><i aria-hidden="true" /><span>+{summary.remaining} 站</span></li> : null}
    </ol>
  );
}

function IntentRow({ intent, index, featured = false }: { intent: BuddyIntentView; index: number; featured?: boolean }) {
  return (
    <Link className={`buddy-match-row ${featured ? "is-featured" : ""}`} href={`/buddy/intents/${intent.id}` as AppRoute}>
      <span className="buddy-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div className="buddy-row-person">
        <BuddyAvatar profile={intent.owner} size="medium" />
        <span>
          <strong>{intent.owner?.displayName ?? "等待搭子"}</strong>
          <small>{buddyModeLabel(intent.mode)} · {intent.owner?.city ?? intent.city}</small>
        </span>
      </div>
      <div className="buddy-row-story">
        <div>
          {featured ? <span className="buddy-row-featured">优先推荐</span> : null}
          <BuddyStatus value={intent.status} />
        </div>
        <h2>{intent.route.title ?? "共同路线"}</h2>
        <p>{intent.publicNote ?? intent.route.summary ?? "一起沿着这条路线出发。"}</p>
        <BuddyLabels intent={intent} />
      </div>
      <div className="buddy-row-journey">
        <BuddyRouteFacts route={intent.route} time={formatDeparture(intent.departureStart)} meeting={intent.meeting.area ?? undefined} />
        <BuddyRoutePath route={intent.route} />
      </div>
      <ChevronRight className="buddy-row-arrow" aria-hidden="true" size={18} />
    </Link>
  );
}

function GroupRow({ group, index, viewerId, featured = false }: { group: BuddyDashboardGroup; index: number; viewerId: string; featured?: boolean }) {
  const profile = group.members.find((member) => member.role === "MEMBER")?.profile ?? group.members[0]?.profile;
  const membership = group.members.find((member) => member.userId === viewerId);
  const archived = group.status !== "ACTIVE" || membership?.status !== "ACTIVE";
  const archiveLabel = membership?.status === "LEFT" || membership?.status === "REMOVED"
    ? "已退出"
    : group.status === "CANCELLED" ? "已取消" : "已结束";
  return (
    <Link className={`buddy-match-row group-row ${featured ? "is-featured" : ""} ${archived ? "is-archived" : ""}`} href={`/buddy/groups/${group.id}` as AppRoute}>
      <span className="buddy-row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div className="buddy-row-person">
        <BuddyAvatar profile={profile as BuddyPublicProfileView | null} size="medium" />
        <span><strong>{profile?.displayName ?? "你的搭子"}</strong><small>共同路线 · {profile?.city ?? group.route.city}</small></span>
      </div>
      <div className="buddy-row-story">
        <div>{featured ? <span className="buddy-row-featured">最近同行</span> : null}{archived ? <span className="buddy-editorial-status" data-status="expired">{archiveLabel}</span> : <BuddyStatus context="group" value={group.status} />}</div>
        <h2>{group.route.title ?? "共同路线"}</h2>
        <p>{group.route.summary ?? "两个人的城市行程已经开始。"}</p>
      </div>
      <div className="buddy-row-journey">
        <BuddyRouteFacts route={group.route} time={formatDeparture(group.departureStart)} meeting={group.meetingLabel} />
        <BuddyRoutePath route={group.route} />
      </div>
      <ChevronRight className="buddy-row-arrow" aria-hidden="true" size={18} />
    </Link>
  );
}

function RouteRibbon({ route, onCompose }: { route?: BuddyPublishRoute; onCompose: (mode: BuddyComposeMode) => void }) {
  if (route?.status === "ready") {
    return (
      <section className="buddy-route-ribbon">
        <div className="buddy-route-ribbon-copy">
          <div><span><RouteIcon aria-hidden="true" size={14} />当前路线</span><Link href="/buddy">清除筛选</Link></div>
          <h2>{route.route.title}</h2>
          <p>{route.route.summary}</p>
        </div>
        <BuddyRouteLine maxStops={4} route={route.route} />
        <div className="buddy-route-ribbon-actions">
          <small>{buddyRouteMeta(route.route)}</small>
          <div>
            <button className="secondary" onClick={() => onCompose("POST")} type="button"><UsersRound aria-hidden="true" size={17} />发布组队</button>
            <button onClick={() => onCompose("AUTO")} type="button"><Shuffle aria-hidden="true" size={17} />自动匹配</button>
          </div>
        </div>
      </section>
    );
  }

  const unavailable = route?.status === "not-owned" || route?.status === "missing";
  return (
    <section className={`buddy-route-ribbon empty ${unavailable ? "unavailable" : ""}`}>
      <div className="buddy-route-ribbon-copy">
        <div><span><RouteIcon aria-hidden="true" size={14} />当前路线</span></div>
        <h2>{route?.status === "not-owned" ? "这条路线不属于当前账户" : route?.status === "missing" ? "这条路线已经失效" : "先选一条今晚想走的路线"}</h2>
        <p>{unavailable ? "重新生成属于你的路线后，即可寻找同路人。" : "路线会成为你和搭子的共同上下文，匹配也会更准确。"}</p>
      </div>
      <div className="buddy-route-empty-line" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="buddy-route-ribbon-actions"><Link className="buddy-route-start" href="/"><RouteIcon aria-hidden="true" size={17} />生成路线<ArrowUpRight aria-hidden="true" size={16} /></Link></div>
    </section>
  );
}

function TonightDesk({
  route,
  groups,
  mine,
  profileReady,
  viewerId,
  onCompose,
}: {
  route?: BuddyRouteView;
  groups: BuddyDashboardGroup[];
  mine: BuddyIntentView[];
  profileReady: boolean;
  viewerId: string;
  onCompose: (mode: BuddyComposeMode) => void;
}) {
  const activeAuto = mine.find((intent) => intent.mode === "AUTO" && intent.status === "ACTIVE");
  const activePost = mine.find((intent) => intent.status === "ACTIVE");
  const currentRoute = route ?? groups[0]?.route ?? activeAuto?.route ?? activePost?.route;
  const companions = groups
    .flatMap((group) => group.members)
    .map((member) => member.profile)
    .filter((profile): profile is BuddyPublicProfileView => Boolean(profile && profile.userId !== viewerId))
    .slice(0, 3);
  const state = groups.length > 0
    ? { label: "已经找到同路人", copy: `${groups.length} 段共同旅程正在进行`, tone: "matched" }
    : activeAuto
      ? { label: "正在自动匹配", copy: "正在比较路线、时段和活动节奏", tone: "matching" }
      : activePost
        ? { label: "等待同行回应", copy: "你的公开组队已经出现在广场", tone: "waiting" }
        : { label: "今晚还没有安排", copy: "从当前路线发起一次轻松的相遇", tone: "idle" };

  return (
    <aside className="buddy-match-desk">
      <header>
        <div><p className="buddy-folio-kicker">YOUR EVENING</p><h2>今晚的安排</h2></div>
        <MapPin aria-hidden="true" size={19} />
      </header>

      <section className="buddy-desk-state" data-tone={state.tone}>
        <div><span aria-hidden="true" /><small>当前匹配状态</small></div>
        <strong>{state.label}</strong>
        <p>{state.copy}</p>
        {companions.length ? <div className="buddy-desk-avatars">{companions.map((profile) => <BuddyAvatar key={profile.userId} profile={profile} size="small" />)}<span>同行中</span></div> : route ? <button onClick={() => onCompose("AUTO")} type="button"><Shuffle aria-hidden="true" size={15} />开始自动匹配</button> : null}
      </section>

      <section className="buddy-desk-route">
        <div><span><RouteIcon aria-hidden="true" size={14} />我的路线</span>{currentRoute ? <small>{currentRoute.durationMinutes} 分钟</small> : null}</div>
        {currentRoute ? <><h3>{currentRoute.title}</h3><BuddyRoutePath route={currentRoute} /></> : <><h3>等待一条路线</h3><p>从首页生成今晚的城市路线。</p></>}
      </section>

      <section className="buddy-desk-profile">
        <div><UserRoundCheck aria-hidden="true" size={17} /><span><strong>公开资料</strong><small>{profileReady ? "已准备好被同路人看见" : "完成资料后才能发起匹配"}</small></span></div>
        <span className={profileReady ? "ready" : ""}>{profileReady ? <CheckCircle2 aria-hidden="true" size={16} /> : "待完善"}</span>
        <Link href="/settings/buddy-profile"><UserRoundPen aria-hidden="true" size={14} />编辑资料</Link>
      </section>

      <section className="buddy-desk-safety">
        <ShieldCheck aria-hidden="true" size={18} />
        <div><strong>见面保持轻松，也保持清醒</strong><p>选择公共场所集合，不提前交换敏感信息。</p><span>公共场所 · 站内沟通</span></div>
      </section>
    </aside>
  );
}

export function BuddyHub({ route, initialCompose, initialTab = "discover", profileReady, viewerId }: Props) {
  const readyRoute = route?.status === "ready" ? route.route : undefined;
  const routeId = readyRoute?.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { intents, mine, applications, groups, loading, error, refresh } = useBuddyIntents(routeId);
  const tab = parseBuddyTab(searchParams.get("tab") ?? initialTab);
  const [composeMode, setComposeMode] = useState<BuddyComposeMode | undefined>(readyRoute ? initialCompose : undefined);
  const [notice, setNotice] = useState<string>();
  const intentRows = tab === "discover" ? intents : [...mine, ...applications.map((item) => item.intent)];
  const empty = tab === "groups" ? groups.length === 0 : intentRows.length === 0;
  const city = readyRoute?.city ?? intents[0]?.city ?? mine[0]?.city ?? "北京";
  const pendingCount = mine.filter((intent) => intent.status === "ACTIVE").length + applications.filter((item) => item.status === "PENDING").length;
  const activeGroups = groups.filter((group) => group.status === "ACTIVE" && group.members.some((member) => member.userId === viewerId && member.status === "ACTIVE"));
  const archivedGroups = groups.filter((group) => !activeGroups.includes(group));
  const profileHref = readyRoute && composeMode
    ? `/settings/buddy-profile?next=${encodeURIComponent(`/buddy?routeId=${readyRoute.id}&compose=${composeMode}`)}`
    : "/settings/buddy-profile";

  function selectTab(next: BuddyHubTab) {
    router.replace(buddyTabHref({ tab: next, routeId }) as AppRoute, { scroll: false });
  }

  async function created(result: RouteBuddyCreatedResult) {
    if (result.groupId) { location.href = `/buddy/groups/${result.groupId}`; return; }
    selectTab("mine");
    setNotice(result.mode === "AUTO" ? "自动匹配已经开始，我们会继续寻找同路线的人。" : "公开组队已经发布，等待一位同路人的回应。" );
    await refresh();
  }

  const tabs: Array<{ id: BuddyHubTab; label: string; count: number; icon: typeof Compass }> = [
    { id: "discover", label: "发现同路人", count: intents.length, icon: Compass },
    { id: "mine", label: "我的意向", count: mine.length + applications.length, icon: FileText },
    { id: "groups", label: "我的搭子", count: groups.length, icon: MessageCircle },
  ];

  return (
    <section className="buddy-hub">
      <header className="buddy-hub-context">
        <div>
          <p className="buddy-folio-kicker">CITY COMPANIONS</p>
          <div><h1>搭子广场</h1><span><MapPin aria-hidden="true" size={14} />{city} · 今晚</span></div>
          <p>沿同一条路线，找到节奏相近的人。</p>
        </div>
        <dl>
          <div><dt><UsersRound aria-hidden="true" size={17} />同路邀约</dt><dd>{intents.length}</dd></div>
          <div><dt><MessageCircle aria-hidden="true" size={17} />待回应</dt><dd>{pendingCount}</dd></div>
        </dl>
      </header>

      <RouteRibbon onCompose={setComposeMode} route={route} />
      {notice ? <p className="buddy-success-notice" role="status">{notice}</p> : null}

      <div className="buddy-hub-workspace">
        <div className="buddy-hub-feed">
          <nav aria-label="搭子广场栏目" className="buddy-tabs">
            {tabs.map(({ id, label, count, icon: Icon }) => (
              <button aria-current={tab === id ? "page" : undefined} className={tab === id ? "active" : ""} key={id} onClick={() => selectTab(id)} type="button">
                <Icon aria-hidden="true" size={16} /><span>{label}</span><em>{count}</em>
              </button>
            ))}
            <button aria-label="刷新搭子内容" className="buddy-refresh" disabled={loading} onClick={() => void refresh()} type="button"><RefreshCw aria-hidden="true" size={17} /></button>
          </nav>

          {loading ? (
            <div aria-label="正在加载搭子内容" className="buddy-match-list buddy-loading-list">
              {[0, 1, 2].map((item) => <div className="buddy-row-skeleton" key={item}><i /><i /><i /></div>)}
            </div>
          ) : error ? (
            <div className="buddy-empty error"><CircleAlert aria-hidden="true" size={25} /><strong>暂时无法读取同路人</strong><p>{error}</p><button onClick={() => void refresh()} type="button">重新加载</button></div>
          ) : empty ? (
            <div className="buddy-empty buddy-empty-actionable">
              <BookOpen aria-hidden="true" size={25} />
              <div><strong>今晚这里还很安静</strong><p>{readyRoute ? "成为这条路线的第一位发起人。" : "从一条真实路线开始，让同行的人知道你想去哪里。"}</p></div>
              <div className="buddy-empty-actions">
                {readyRoute ? <button onClick={() => setComposeMode("POST")} type="button"><UsersRound aria-hidden="true" size={16} />发布第一则组队</button> : <Link href="/"><RouteIcon aria-hidden="true" size={16} />生成今晚路线</Link>}
                <button className="secondary" onClick={() => void refresh()} type="button"><RefreshCw aria-hidden="true" size={15} />刷新广场</button>
                <Link className="secondary" href="/settings/buddy-profile"><UserRoundPen aria-hidden="true" size={15} />完善同行资料</Link>
              </div>
            </div>
          ) : (
            <div className="buddy-match-list">
              {tab === "groups"
                ? <div className="buddy-group-sections">
                    {activeGroups.length ? <section><header><MessageCircle aria-hidden="true" size={15} /><span><strong>正在同行</strong><small>{activeGroups.length} 段进行中的共同路线</small></span></header>{activeGroups.map((group, index) => <GroupRow featured={index === 0} group={group} index={index} key={group.id} viewerId={viewerId} />)}</section> : null}
                    {archivedGroups.length ? <section className="archive"><header><Archive aria-hidden="true" size={15} /><span><strong>历史档案</strong><small>{archivedGroups.length} 段只读同行记录</small></span></header>{archivedGroups.map((group, index) => <GroupRow group={group} index={index} key={group.id} viewerId={viewerId} />)}</section> : null}
                  </div>
                : intentRows.map((intent, index) => <IntentRow featured={index === 0} index={index} intent={intent} key={intent.id} />)}
            </div>
          )}
        </div>

        <TonightDesk groups={activeGroups} mine={mine} onCompose={setComposeMode} profileReady={profileReady} route={readyRoute} viewerId={viewerId} />
      </div>

      {composeMode && readyRoute ? (
        <RouteBuddySheet
          initialMode={composeMode}
          onClose={() => setComposeMode(undefined)}
          onCreated={(result) => void created(result)}
          profileHref={profileHref}
          profileReady={profileReady}
          route={{ id: readyRoute.id, title: readyRoute.title, summary: readyRoute.summary, durationLabel: readyRoute.durationMinutes ? `${readyRoute.durationMinutes} 分钟` : undefined, stopCount: readyRoute.stops.length }}
          viewerId={viewerId}
        />
      ) : null}
    </section>
  );
}
