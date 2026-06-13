import { RadioTower } from "lucide-react";
import type { SourceSignal } from "@/server/recommendation/types";

export function SourceSignalBadge({ signal }: { signal: SourceSignal }) {
  return (
    <span className="signal-badge" title={signal.evidence}>
      <RadioTower size={14} />
      {signal.label}
      <strong>{signal.score}</strong>
    </span>
  );
}
