"use client";

import { useState } from "react";

export type MoodType = "solo" | "quiet" | "lively" | "date" | "random";

interface MoodOrb {
  id: MoodType;
  label: string;
  emoji: string;
  color: string;
  gradient: string;
}

const MOOD_ORBS: MoodOrb[] = [
  {
    id: "solo",
    label: "Solo 探索",
    emoji: "🚶",
    color: "#087f7a",
    gradient: "linear-gradient(135deg, #087f7a, #066662)",
  },
  {
    id: "quiet",
    label: "安静时光",
    emoji: "🍃",
    color: "#5a8a7a",
    gradient: "linear-gradient(135deg, #5a8a7a, #4a7a6a)",
  },
  {
    id: "lively",
    label: "热闹非凡",
    emoji: "🎉",
    color: "#c7583a",
    gradient: "linear-gradient(135deg, #c7583a, #a7482a)",
  },
  {
    id: "date",
    label: "浪漫约会",
    emoji: "💕",
    color: "#b78419",
    gradient: "linear-gradient(135deg, #b78419, #976409)",
  },
  {
    id: "random",
    label: "随机冒险",
    emoji: "🎲",
    color: "#6a5a8a",
    gradient: "linear-gradient(135deg, #6a5a8a, #5a4a7a)",
  },
];

interface MoodSelectorProps {
  value?: MoodType;
  onChange?: (mood: MoodType) => void;
}

export function MoodOrbSelector({ value, onChange }: MoodSelectorProps) {
  const [selected, setSelected] = useState<MoodType>(value || "solo");
  const [hovered, setHovered] = useState<string | null>(null);

  const handleSelect = (moodId: MoodType) => {
    setSelected(moodId);
    onChange?.(moodId);
  };

  return (
    <div className="mood-orb-container">
      <div className="mood-orb-stage">
        {MOOD_ORBS.map((mood, index) => {
          const isSelected = selected === mood.id;
          const isHovered = hovered === mood.id;

          return (
            <button
              key={mood.id}
              className={`mood-orb ${isSelected ? "selected" : ""}`}
              onClick={() => handleSelect(mood.id)}
              onMouseEnter={() => setHovered(mood.id)}
              onMouseLeave={() => setHovered(null)}
              style={
                {
                  "--mood-color": mood.color,
                  "--mood-gradient": mood.gradient,
                  "--orb-size": isSelected ? "120px" : isHovered ? "110px" : "100px",
                  "--orb-index": index,
                } as React.CSSProperties
              }
              type="button"
            >
              <span className="mood-orb-emoji">{mood.emoji}</span>
              <span className="mood-orb-label">{mood.label}</span>

              {isSelected && (
                <span className="mood-orb-check">✓</span>
              )}

              <div className="mood-orb-glow" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================
   Mood Orb 组件样式
   ================================================ */

const styles = `
.mood-orb-container {
  padding: 40px 20px;
}

.mood-orb-stage {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 32px;
  flex-wrap: wrap;
}

.mood-orb {
  position: relative;
  width: var(--orb-size, 100px);
  height: var(--orb-size, 100px);
  border-radius: 50%;
  background: var(--mood-gradient);
  border: 3px solid transparent;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.mood-orb::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  padding: 3px;
  background: linear-gradient(135deg, rgba(255,255,255,0.4), transparent);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.mood-orb:hover::before {
  opacity: 1;
}

.mood-orb:hover {
  transform: scale(1.1) translateY(-8px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.mood-orb.selected {
  transform: scale(1.15);
  box-shadow: 0 24px 48px var(--mood-glow, rgba(8, 127, 122, 0.3));
}

.mood-orb-emoji {
  font-size: 32px;
  margin-bottom: 4px;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.mood-orb:hover .mood-orb-emoji {
  transform: scale(1.3) rotate(-10deg);
}

.mood-orb-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: white;
  text-align: center;
  line-height: 1.2;
}

.mood-orb-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--mood-color);
  animation: check-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes check-bounce {
  0% { transform: scale(0) rotate(-45deg); }
  50% { transform: scale(1.2) rotate(10deg); }
  100% { transform: scale(1) rotate(0deg); }
}

.mood-orb-glow {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--mood-color) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.4s ease;
  filter: blur(16px);
  z-index: -1;
}

.mood-orb.selected .mood-orb-glow {
  opacity: 0.4;
  animation: glow-pulse 3s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.1); }
}

@media (max-width: 768px) {
  .mood-orb-stage {
    gap: 20px;
  }

  .mood-orb {
    --orb-size: 80px !important;
  }

  .mood-orb-emoji {
    font-size: 24px;
  }

  .mood-orb-label {
    font-size: 9px;
  }
}
`;

// 注入样式
if (typeof document !== "undefined" && !document.getElementById("mood-orb-styles")) {
  const styleSheet = document.createElement("style");
  styleSheet.id = "mood-orb-styles";
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
