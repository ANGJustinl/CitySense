import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { listOwnSubmissions } from "@/server/submissions/service";
import { ProductPageHeader } from "@/components/ProductPageHeader";
import {
  countSubmissionImages,
  groupSubmissionsForDisplay,
  SUBMISSION_DISPLAY_GROUPS,
  SUBMISSION_STATUS_META
} from "@/server/submissions/presentation";

export const dynamic = "force-dynamic";

function formatLocation(item: { city: string; area: string | null; address: string }) {
  return [item.city, item.area, item.address].filter(Boolean).join(" · ");
}

export default async function MySubmissionsPage() {
  const user = await requireUser();
  const submissions = await listOwnSubmissions(user.appUser.id);
  const groups = groupSubmissionsForDisplay(submissions);
  return (
    <><ProductPageHeader active="submissions" /><main className="detail-shell submission-product-page">
      <Link className="back-link" href="/"><ArrowLeft size={16} />返回工作台</Link>
      <section className="detail-panel wide submission-list-wrap">
        <div className="submission-list-heading">
          <div><p className="eyebrow">MY CONTRIBUTIONS</p><h1>我的地点投稿</h1><p className="submission-list-intro">查看投稿的最新处理进度。</p></div>
          <Link className="primary-button" href="/submit-place"><Plus size={16} />分享地点</Link>
        </div>
        {submissions.length === 0 ? <p className="submission-list-empty">还没有投稿，分享一个你发现的小众地点吧。</p> : (
          <div className="submission-groups">
            {SUBMISSION_DISPLAY_GROUPS.map((group) => {
              const items = groups[group.key];
              if (!items.length) return null;
              return (
                <section className="submission-group" key={group.key}>
                  <header className="submission-group-heading">
                    <div><h2>{group.label}<span className="submission-group-count">{items.length}</span></h2><p>{group.description}</p></div>
                  </header>
                  <div className="submission-card-list">
                    {items.map((item) => {
                      const status = SUBMISSION_STATUS_META[item.status];
                      const images = countSubmissionImages(item.images);
                      return (
                        <Link className="submission-card" href={`/my-submissions/${item.id}`} key={item.id}>
                          <div className="submission-card-topline">
                            <span className={`submission-status tone-${status.tone}`}>{status.label}</span>
                            <time dateTime={item.updatedAt.toISOString()}>更新于 {item.updatedAt.toLocaleString("zh-CN")}</time>
                          </div>
                          <strong className="submission-card-title">{item.name}</strong>
                          <span className="submission-card-location">{formatLocation(item)}</span>
                          <span className="submission-card-message">{item.publicStatusMessage || status.description}</span>
                          <span className="submission-card-meta">
                            <span className="submission-image-stat">有效图片 {images.valid} 张</span>
                            {images.failed ? <span className="submission-image-stat failed">失败 {images.failed} 张</span> : null}
                            {item.resultingVenue ? <span className="submission-image-stat">已生成地点</span> : null}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main></>
  );
}
