import Link from "next/link";
import { ArrowLeft, Bookmark } from "lucide-react";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { ProductPageHeader } from "@/components/ProductPageHeader";
import { requireUser } from "@/server/auth/current-user";
import { listBookmarks } from "@/server/community/feed";

export const dynamic = "force-dynamic";
export default async function CommunityBookmarksPage() {
  const user = await requireUser(); const feed = await listBookmarks(user.appUser.id);
  return <main className="community-page-shell bookmarks-page"><ProductPageHeader active="community" /><nav className="community-page-nav"><Link href="/community"><ArrowLeft size={16} />返回社区</Link><span><Bookmark size={15} />私人收藏</span></nav><header className="community-section-intro"><p className="eyebrow">YOUR CITY ARCHIVE</p><h1>留待下次出发</h1><p>收藏只对你可见。把想去的地方、路线和故事放在这里。</p></header><CommunityFeed context={{ kind: "bookmarks" }} initialCursor={feed.nextCursor} initialPosts={feed.posts} viewerId={user.appUser.id} copy={{ eyebrow: "YOUR CITY ARCHIVE", title: "留待下次出发", populated: "收藏只对你可见。把想去的地方、路线和故事放在这里。", empty: "还没有收藏的手记。" }} /></main>;
}
