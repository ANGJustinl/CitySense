import Link from "next/link";
import { ArrowLeft, Compass, MapPinPlus } from "lucide-react";
import "./submit-place.css";
import { requireUser } from "@/server/auth/current-user";
import { PlaceSubmissionForm } from "@/components/submissions/PlaceSubmissionForm";

export const dynamic = "force-dynamic";

export default async function SubmitPlacePage() {
  await requireUser();

  return (
    <main className="submit-place-page">
      <div className="submit-place-shell">
        <Link className="submit-place-back" href="/">
          <ArrowLeft size={16} />
          返回工作台
        </Link>

        <div className="submit-place-layout">
          <aside className="submit-place-intro">
            <span className="submit-place-mark"><MapPinPlus size={22} /></span>
            <p className="submit-place-eyebrow">CITY FIELD NOTE · 01</p>
            <h1>把一个值得被看见的地方，留在城市里。</h1>
            <p className="submit-place-lede">不需要写成攻略。告诉我们它是谁、怎么找到它，再留下一组现场照片，就足够开始。</p>

            <ol className="submit-place-steps">
              <li><b>01</b><span><strong>写清楚它是谁</strong><small>一个名字，一段真实的推荐理由。</small></span></li>
              <li><b>02</b><span><strong>告诉我们怎么找</strong><small>地址是必填，地图定位可以稍后补。</small></span></li>
              <li><b>03</b><span><strong>留下一组现场照片</strong><small>最多 5 张，从不同角度记录它的入口与氛围。</small></span></li>
            </ol>

            <div className="submit-place-note">
              <Compass size={18} />
              <div><strong>提交后会发生什么？</strong><p>系统会先做基础技术检查，再根据地址和地点信息进行确认。你的账号信息不会公开展示。</p></div>
            </div>
          </aside>

          <section aria-labelledby="submit-place-form-title" className="submit-place-card">
            <div className="submit-place-card-heading">
              <div><p className="submit-place-kicker">A SMALL PLACE, A REAL STORY</p><h2 id="submit-place-form-title">分享小众地点</h2></div>
              <span className="submit-place-required">带 * 为必填</span>
            </div>
            <PlaceSubmissionForm />
          </section>
        </div>
      </div>
    </main>
  );
}
