import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommunityComments } from "@/components/community/CommunityComments";
import { CommunityPostDetail } from "@/components/community/CommunityPostDetail";
import { ProductPageHeader } from "@/components/ProductPageHeader";
import { getOptionalUser } from "@/server/auth/current-user";
import { listCommunityComments } from "@/server/community/comments";
import { getCommunityPost } from "@/server/community/feed";

export const dynamic = "force-dynamic";

export default async function CommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getOptionalUser();
  const [post, comments] = await Promise.all([getCommunityPost(id, viewer?.appUser.id), listCommunityComments(id)]);
  return (
    <main className="community-page-shell post-detail-page">
      <ProductPageHeader active="community" city={post.city} />
      <nav className="community-page-nav"><Link href="/community"><ArrowLeft size={16} />返回社区</Link><span>城市手记</span></nav>
      <CommunityPostDetail post={post} viewerId={viewer?.appUser.id} />
      <CommunityComments initialComments={comments.comments} postId={id} viewerId={viewer?.appUser.id} />
    </main>
  );
}
