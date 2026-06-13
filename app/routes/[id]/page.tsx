import Link from "next/link";
import { ArrowLeft, MapPinned } from "lucide-react";

export default async function RouteDetail({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="detail-shell">
      <Link className="back-link" href="/">
        <ArrowLeft size={16} />
        返回工作台
      </Link>
      <section className="detail-panel">
        <MapPinned size={26} />
        <div>
          <p className="eyebrow">Route detail</p>
          <h1>{id}</h1>
          <p>
            路线详情页已预留。下一步可以在 recommendation_logs 中读取真实推荐结果，
            展示地图 polyline、站点停留时间和反馈记录。
          </p>
        </div>
      </section>
    </main>
  );
}
