"use client";

import { CloudRain, MapPin, Star, Sun, TrendingUp } from "lucide-react";
import type { ChatCard } from "@/hooks/useChat";

/**
 * 聊天气泡内的富文本卡片渲染。
 * 根据 card.kind 渲染不同样式：路线 / 天气 / 活动。
 */

function weatherIcon(phenomenon: string) {
  if (/雨/.test(phenomenon)) return <CloudRain size={28} />;
  if (/晴/.test(phenomenon)) return <Sun size={28} />;
  return <CloudRain size={28} />;
}

export function ChatCards({ cards }: { cards: ChatCard[] }) {
  if (!cards || cards.length === 0) {
    return null;
  }

  return (
    <div className="chat-cards">
      {cards.map((card, index) => {
        if (card.kind === "route") {
          return (
            <a
              key={`route-${index}`}
              className="chat-card route-card"
              href={card.routeId ? `/routes/${card.routeId}` : "/"}
            >
              <div className="chat-card-head">
                <MapPin size={15} />
                <span className="chat-card-title">{card.title}</span>
                <span className="chat-card-score">
                  <Star size={12} />
                  {card.score}
                </span>
              </div>
              <p className="chat-card-places">{card.places.join(" → ")}</p>
              <p className="chat-card-meta">约 {card.duration} 分钟</p>
            </a>
          );
        }

        if (card.kind === "weather") {
          return (
            <div key={`weather-${index}`} className="chat-card weather-card">
              <div className="chat-card-head">
                {weatherIcon(card.phenomenon)}
                <span className="chat-card-title">{card.city}</span>
                <span className="chat-card-score">{card.temperature}°</span>
              </div>
              <p className="chat-card-meta">{card.phenomenon}</p>
              {card.forecast.length > 0 ? (
                <div className="weather-forecast">
                  {card.forecast.map((f) => (
                    <div key={f.date} className="forecast-day">
                      <span className="forecast-date">{f.date.slice(5)}</span>
                      <span>{f.dayWeather}</span>
                      <span className="forecast-temp">{f.dayTemp}°</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }

        if (card.kind === "activity") {
          return (
            <div key={`activity-${index}`} className="chat-card activity-card">
              <div className="chat-card-head">
                <TrendingUp size={15} />
                <span className="chat-card-title">{card.title}</span>
              </div>
              <div className="chat-card-tags">
                {card.tags.map((tag) => (
                  <span key={tag} className="chat-tag">{tag}</span>
                ))}
              </div>
              <p className="chat-card-meta">
                {card.area ? `${card.area} · ` : ""}
                热度 {card.trendScore}
                {card.startTime ? ` · ${card.startTime.slice(0, 10)}` : ""}
              </p>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
