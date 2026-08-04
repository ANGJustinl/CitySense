import Link from "next/link";
import { ArrowLeft, MapPinPlus } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { PlaceSubmissionForm } from "@/components/submissions/PlaceSubmissionForm";

export const dynamic = "force-dynamic";

export default async function SubmitPlacePage() {
  await requireUser();
  return (
    <main className="detail-shell">
      <Link className="back-link" href="/"><ArrowLeft size={16} />返回工作台</Link>
      <section className="detail-panel wide submission-panel">
        <MapPinPlus size={30} />
        <div>
          <p className="eyebrow">Share a hidden gem</p>
          <h1>分享小众地点</h1>
          <p>高德找不到也没关系。填写真实地址、地图位置和现场照片，系统会检查重复与位置后发布。</p>
          <PlaceSubmissionForm />
        </div>
      </section>
    </main>
  );
}
