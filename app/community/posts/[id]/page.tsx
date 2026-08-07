import Link from "next/link";
import { ArrowLeft, MapPin, Route } from "lucide-react";
import { CommunityComments } from "@/components/community/CommunityComments";
import { ProductPageHeader } from "@/components/ProductPageHeader";
import { getOptionalUser } from "@/server/auth/current-user";
import { listCommunityComments } from "@/server/community/comments";
import { getCommunityPost } from "@/server/community/feed";
import { UserAvatar } from "@/components/UserAvatar";

export const dynamic = "force-dynamic";

export default async function CommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getOptionalUser();
  const [post, comments] = await Promise.all([getCommunityPost(id, viewer?.appUser.id), listCommunityComments(id)]);
  return (
    <main className="community-page-shell post-detail-page">
      <ProductPageHeader active="community" city={post.city} />
      <nav className="community-page-nav"><Link href="/community"><ArrowLeft size={16} />返回社区</Link><span>城市手记</span></nav>
      <article className="community-post-detail">
        <header><UserAvatar avatarUrl={post.author?.avatarUrl} className="community-avatar large" identity={post.author?.userId ?? post.id} name={post.author?.displayName ?? "城市居民"} /><div><Link href={post.author ? `/community/profile/${post.author.userId}` : "#"}>{post.author?.displayName ?? "城市居民"}</Link><small>{post.city}{post.area ? ` · ${post.area}` : ""} · {post.publishedAt ? new Date(post.publishedAt).toLocaleString("zh-CN") : ""}</small></div></header>
        <p className="community-detail-body">{post.body}</p>
        {post.images.length ? <div className="community-detail-images">{post.images.map((image) => <img alt={image.altText ?? "城市手记图片"} key={image.id} src={image.url} />)}</div> : null}
        {post.attachments.length ? <div className="community-attachments detail">{post.attachments.map((attachment) => <div key={attachment.id}>{attachment.type === "PLACE" ? <MapPin size={18} /> : <Route size={18} />}<span><strong>{attachment.title}</strong><small>{attachment.subtitle}</small></span></div>)}</div> : null}
      </article>
      <CommunityComments initialComments={comments.comments} postId={id} viewerId={viewer?.appUser.id} />
    </main>
  );
}
