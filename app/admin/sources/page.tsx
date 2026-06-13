import Link from "next/link";
import { ArrowLeft, Cable, CheckCircle2, CircleDashed } from "lucide-react";
import { getConnectorStatuses } from "@/server/sources/source-registry";

export default function SourcesAdminPage() {
  const connectors = getConnectorStatuses();

  return (
    <main className="detail-shell">
      <Link className="back-link" href="/">
        <ArrowLeft size={16} />
        返回工作台
      </Link>
      <section className="detail-panel wide">
        <Cable size={26} />
        <div>
          <p className="eyebrow">Source adapters</p>
          <h1>城市信号接入层</h1>
          <div className="source-table">
            {connectors.map((connector) => (
              <div className="source-row" key={connector.source}>
                <span>{connector.source}</span>
                <span>{connector.kind}</span>
                <span className={`status-dot ${connector.status}`}>
                  {connector.status === "active" ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}
                  {connector.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
