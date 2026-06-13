import { Activity, Database, RadioTower, TimerReset } from "lucide-react";
import type { RecommendResponse } from "@/server/recommendation/types";

export function CityPulsePanel({ response }: { response: RecommendResponse }) {
  const topRoute = response.routes[0];
  const signalCount = response.routes.reduce((sum, route) => sum + route.sourceSignals.length, 0);

  return (
    <div className="pulse-stack">
      <div className="city-image" />

      <div className="section-heading">
        <Activity size={18} />
        <span>城市信号</span>
      </div>

      <div className="pulse-list">
        <div>
          <RadioTower size={17} />
          <span>来源信号</span>
          <strong>{signalCount}</strong>
        </div>
        <div>
          <Database size={17} />
          <span>候选池</span>
          <strong>{response.meta.candidateCount}</strong>
        </div>
        <div>
          <TimerReset size={17} />
          <span>交通</span>
          <strong>{response.meta.trafficProvider}</strong>
        </div>
      </div>

      <div className="pulse-copy">
        <strong>{topRoute?.title ?? "路线生成中"}</strong>
        <p>{topRoute?.summary ?? "等待推荐输入"}</p>
      </div>
    </div>
  );
}
