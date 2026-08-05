import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommunityComposer } from "@/components/community/CommunityComposer";
import { requireUser } from "@/server/auth/current-user";

export default async function NewCommunityPostPage({ searchParams }: { searchParams: Promise<{ routeId?: string; city?: string }> }) {
  await requireUser();
  const params = await searchParams;
  return <main className="community-page-shell editor-page"><nav className="community-page-nav"><Link href="/community"><ArrowLeft size={16} />返回社区</Link><span>公开发布 · 后审</span></nav><CommunityComposer defaultCity={params.city ?? "上海"} routeSnapshotId={params.routeId} /></main>;
}
