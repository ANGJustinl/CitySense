import Link from "next/link";
import { ArrowLeft, Route } from "lucide-react";
import { BuddyHub } from "@/components/buddy/BuddyHub";

export default async function BuddyPage({ searchParams }: { searchParams: Promise<{ routeId?: string }> }) {
  const { routeId } = await searchParams;
  return <main className="buddy-page-shell"><nav className="buddy-page-nav"><Link href="/"><ArrowLeft size={16} />返回城市脉搏</Link><Link href="/settings/buddy-profile">公开资料</Link></nav><BuddyHub routeId={routeId} />{routeId ? <p className="buddy-route-filter"><Route size={15} />当前只展示同一条推荐路线的组队</p> : null}</main>;
}
