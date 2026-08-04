import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { MomentRecommendationCard as MomentRecommendationCardData } from "@/server/recommendation/types";

type MomentRecommendationCardProps = {
  card?: MomentRecommendationCardData;
  compact?: boolean;
};

function confidenceText(confidence: MomentRecommendationCardData["confidence"]) {
  if (confidence === "high") return "高可信";
  if (confidence === "medium") return "中可信";
  return "低可信";
}

export function MomentRecommendationCard({
  card,
  compact = false
}: MomentRecommendationCardProps) {
  if (!card) {
    return null;
  }

  return (
    <section className={compact ? "moment-card compact" : "moment-card"}>
      <div className="moment-card-kicker">
        <span>
          <Sparkles size={14} />
          城市提醒
        </span>
        <em className={`moment-card-confidence ${card.confidence}`}>
          <ShieldCheck size={13} />
          {confidenceText(card.confidence)}
        </em>
      </div>
      <h3>{card.headline}</h3>
      <p>{card.message}</p>
      <div className="moment-card-proof">
        <span>
          <CheckCircle2 size={14} />
          {card.primaryReason}
        </span>
        {card.timingHint ? (
          <span>
            <Clock3 size={14} />
            {card.timingHint}
          </span>
        ) : null}
      </div>
      <div className="moment-card-action">
        <span>
          <MapPin size={14} />
          {card.nextAction}
        </span>
        <ArrowRight size={14} />
      </div>
    </section>
  );
}
