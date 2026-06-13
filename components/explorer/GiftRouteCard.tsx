"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, MapPin, Clock3, Sparkles } from "lucide-react";
import Link from "next/link";

interface GiftRouteCardProps {
  route: {
    id: string;
    title: string;
    description: string;
    summary?: string;
    image?: string;
    places?: Array<{
      name: string;
      area?: string;
      tags?: string[];
    }>;
    tags?: string[];
    duration?: string;
    distance?: string;
    score?: number;
  };
  index?: number;
  delay?: number;
}

export function GiftRouteCard({ route, index = 0, delay = 0 }: GiftRouteCardProps) {
  const [isUnwrapped, setIsUnwrapped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleToggle = () => {
    setIsUnwrapped(!isUnwrapped);
  };

  // 默认图片（如果未提供）
  const fallbackImages = [
    "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80",
    "https://images.unsplash.com/photo-1544085311-11a028465b03?w=800&q=80",
    "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80",
  ];

  const image = route.image || fallbackImages[index % fallbackImages.length];

  return (
    <div
      className={`gift-route-card ${isUnwrapped ? "unwrapped" : ""}`}
      style={{ animationDelay: `${delay}s` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 丝带 */}
      <div className="gift-ribbon">
        <span className="gift-ribbon-text">NEW</span>
      </div>

      {/* 图片区域 */}
      <div className="gift-image-wrapper">
        <img src={image} alt={route.title} className="gift-image" />

        {/* 悬停时的渐变遮罩 */}
        <div className={`gift-image-overlay ${isHovered ? "visible" : ""}`}>
          <MapPin size={24} />
          <span>查看地图</span>
        </div>

        {/* 路线索引 */}
        <div className="gift-route-index">{index + 1}</div>
      </div>

      {/* 内容区域 */}
      <div className="gift-content">
        <div className="gift-header">
          <h3 className="gift-title">{route.title}</h3>
          {route.score && (
            <div className="gift-score">
              <Sparkles size={14} />
              {route.score}
            </div>
          )}
        </div>

        <p className="gift-summary">{route.summary || route.description}</p>

        {/* 元数据 */}
        <div className="gift-meta">
          {route.duration && (
            <span className="gift-tag">
              <Clock3 size={12} />
              {route.duration}
            </span>
          )}
          {route.distance && (
            <span className="gift-tag">{route.distance}</span>
          )}
          {(route.tags || route.places?.flatMap(p => p.tags))?.slice(0, 3).map((tag, i) => (
            <span key={i} className="gift-tag">{tag}</span>
          ))}
        </div>

        {/* 展开/收起按钮 */}
        <button
          className="gift-toggle"
          onClick={handleToggle}
          type="button"
        >
          <span>{isUnwrapped ? "收起详情" : "展开路线"}</span>
          <ChevronDown
            size={18}
            style={{ transform: isUnwrapped ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        {/* 展开内容 */}
        {isUnwrapped && (
          <div className="gift-details">
            {route.places && route.places.length > 0 && (
              <div className="gift-places">
                <h4>探索站点</h4>
                {route.places.map((place, i) => (
                  <div key={i} className="gift-place">
                    <span className="gift-place-index">{i + 1}</span>
                    <div className="gift-place-info">
                      <strong>{place.name}</strong>
                      {place.area && <span>{place.area}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Link
              href={`/routes/${route.id}`}
              className="gift-link"
            >
              <span>查看完整路线与地图</span>
              <ExternalLink size={14} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================
   Gift Card 样式
   ================================================ */

const giftCardStyles = `
.gift-route-card {
  position: relative;
  background: white;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(8, 127, 122, 0.08);
  transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  opacity: 0;
  animation: gift-appear 0.6s ease forwards;
}

@keyframes gift-appear {
  from {
    opacity: 0;
    transform: translateY(40px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.gift-route-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 24px 56px rgba(8, 127, 122, 0.15);
}

.gift-ribbon {
  position: absolute;
  top: 0;
  right: 32px;
  width: 100px;
  height: 100px;
  background: linear-gradient(135deg, #ff6b4a, #ff8a6a);
  clip-path: polygon(0 0, 100% 0, 50% 50%);
  z-index: 2;
}

.gift-ribbon-text {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%) rotate(-45deg);
  font-size: 10px;
  font-weight: 900;
  color: white;
  letter-spacing: 0.15em;
}

.gift-image-wrapper {
  position: relative;
  width: 100%;
  height: 200px;
  overflow: hidden;
}

.gift-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.gift-route-card:hover .gift-image {
  transform: scale(1.08);
}

.gift-image-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(8, 127, 122, 0.2),
    rgba(8, 127, 122, 0.6)
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: white;
  font-size: 14px;
  font-weight: 700;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.gift-image-overlay.visible {
  opacity: 1;
}

.gift-route-index {
  position: absolute;
  bottom: 16px;
  left: 16px;
  width: 40px;
  height: 40px;
  background: var(--bg-pulse, #087f7a);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 900;
  box-shadow: 0 8px 16px rgba(8, 127, 122, 0.3);
  z-index: 1;
}

.gift-content {
  padding: 24px;
}

.gift-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.gift-title {
  font-family: 'Noto Serif SC', serif;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #1a2e2b);
  line-height: 1.3;
  flex: 1;
}

.gift-score {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: linear-gradient(135deg, rgba(8, 127, 122, 0.1), rgba(8, 127, 122, 0.05));
  border-radius: 999px;
  color: var(--bg-pulse, #087f7a);
  font-size: 14px;
  font-weight: 800;
  flex-shrink: 0;
}

.gift-summary {
  font-size: 14px;
  color: var(--text-secondary, #5a6e6b);
  line-height: 1.6;
  margin-bottom: 16px;
}

.gift-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.gift-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgba(8, 127, 122, 0.06);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--bg-pulse, #087f7a);
}

.gift-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: var(--bg-pulse, #087f7a);
  color: white;
  font-size: 14px;
  font-weight: 700;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.gift-toggle:hover {
  background: var(--accent-strong, #025d59);
  transform: scale(1.02);
}

.gift-toggle svg {
  transition: transform 0.3s ease;
}

.gift-details {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(8, 127, 122, 0.1);
  animation: gift-unfold 0.4s ease;
}

@keyframes gift-unfold {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.gift-places {
  margin-bottom: 16px;
}

.gift-places h4 {
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary, #5a6e6b);
  margin-bottom: 12px;
}

.gift-place {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(8, 127, 122, 0.08);
}

.gift-place:last-child {
  border-bottom: none;
}

.gift-place-index {
  width: 24px;
  height: 24px;
  background: rgba(8, 127, 122, 0.1);
  color: var(--bg-pulse, #087f7a);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}

.gift-place-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gift-place-info strong {
  font-size: 14px;
  color: var(--text-primary, #1a2e2b);
}

.gift-place-info span {
  font-size: 12px;
  color: var(--text-secondary, #5a6e6b);
}

.gift-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: rgba(8, 127, 122, 0.06);
  color: var(--bg-pulse, #087f7a);
  font-size: 13px;
  font-weight: 700;
  border-radius: 999px;
  text-decoration: none;
  transition: all 0.3s ease;
}

.gift-link:hover {
  background: var(--bg-pulse, #087f7a);
  color: white;
  transform: translateX(4px);
}

@media (max-width: 768px) {
  .gift-content {
    padding: 20px;
  }

  .gift-title {
    font-size: 18px;
  }

  .gift-image-wrapper {
    height: 160px;
  }
}
`;

// 注入样式
if (typeof document !== "undefined" && !document.getElementById("gift-card-styles")) {
  const styleSheet = document.createElement("style");
  styleSheet.id = "gift-card-styles";
  styleSheet.textContent = giftCardStyles;
  document.head.appendChild(styleSheet);
}
