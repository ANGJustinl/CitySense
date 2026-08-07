import { Activity, BrainCircuit, Map, RadioTower, ShieldCheck } from "lucide-react";
import { ProductHeader } from "@/components/ProductHeader";
import { CityPulseOverview } from "@/components/city/CityPulseOverview";
import { getOptionalUser } from "@/server/auth/current-user";
import { getCityPulse } from "@/server/recommendation/city-pulse";

export const dynamic = "force-dynamic";

export default async function AboutPage({ searchParams }: { searchParams: Promise<{ city?: string }> }) {
  const [{ city: requestedCity }, viewer] = await Promise.all([searchParams, getOptionalUser()]);
  const city = requestedCity?.trim().slice(0, 40) || "北京";
  const pulse = await getCityPulse({ city });
  const authViewer = viewer ? { id: viewer.appUser.id, email: viewer.authUser.email ?? null, role: viewer.appUser.role } : null;

  return (
    <main className="product-page about-page">
      <ProductHeader active="about" city={city} viewer={authViewer} />
      <section className="about-hero">
        <div className="about-hero-copy">
          <div className="about-hero-topline">
            <p className="product-kicker">ABOUT CITYSENSE</p>
            <span><Activity size={13} />{city} · 城市感知中</span>
          </div>
          <h1>城市不是清单，<span>是此刻正在发生的生活。</span></h1>
          <p>CitySense 把真实城市信号、出行可达性和个人偏好放在一起，给你一条今天真的走得通、也值得走的路线。</p>
        </div>
        <aside className="about-hero-index" aria-label="CitySense 推荐原则">
          <span className="about-hero-signal"><Activity size={15} />LIVE CITY SIGNAL</span>
          <strong>从城市现场，<br />到一条走得通的路线。</strong>
          <div>
            <span><b>01</b>此刻信号</span>
            <span><b>02</b>可达优先</span>
            <span><b>03</b>可信解释</span>
          </div>
        </aside>
      </section>

      <section className="about-section-heading">
        <p className="product-kicker">CITY, RIGHT NOW</p><h2>城市现场</h2><p>不追逐热搜的喧闹，只提取对今天出发真正有用的变化。</p>
      </section>
      <CityPulseOverview initialCity={city} initialPulse={pulse} />

      <section className="about-method">
        <div className="about-section-heading"><p className="product-kicker">HOW IT WORKS</p><h2>一次推荐如何形成</h2></div>
        <ol>
          <li><RadioTower size={21} /><span>01</span><div><h3>感知城市</h3><p>汇集地点、活动、天气、人流与趋势，但不把热度直接等同于值得。</p></div></li>
          <li><Map size={21} /><span>02</span><div><h3>先看能不能到</h3><p>结合出发位置、时间窗口和实时或估算交通，排除今晚走不通的组合。</p></div></li>
          <li><BrainCircuit size={21} /><span>03</span><div><h3>确定性排序</h3><p>用可复现的规则处理兴趣、质量、可信度与最近曝光，AI 不负责凭空发明地点。</p></div></li>
          <li><ShieldCheck size={21} /><span>04</span><div><h3>解释，也承认边界</h3><p>最后把推荐理由写成人能理解的话，同时保留来源、新鲜度和降级说明。</p></div></li>
        </ol>
      </section>
    </main>
  );
}
