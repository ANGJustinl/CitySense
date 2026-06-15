"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// 兴趣数据 - 分不同尺寸创建视觉层次
const INTERESTS = [
  { id: "coffee", label: "☕ 咖啡", size: "large" },
  { id: "exhibition", label: "🎨 展览", size: "large" },
  { id: "bookstore", label: "📚 书店", size: "normal" },
  { id: "music", label: "🎵 独立音乐", size: "large" },
  { id: "nightlife", label: "🌙 夜生活", size: "normal" },
  { id: "comics", label: "💬 漫画", size: "normal" },
  { id: "theater", label: "🎭 剧场", size: "small" },
  { id: "film", label: "🎬 电影", size: "small" },
  { id: "art", label: "🖼️ 艺术", size: "normal" },
  { id: "vintage", label: "🕰️ 古着", size: "small" },
  { id: "park", label: "🌳 公园", size: "normal" },
  { id: "food", label: "🍜 美食", size: "large" },
];

// 心情选项
const MOODS = [
  { id: "solo", label: "Solo 探索", emoji: "🚶" },
  { id: "quiet", label: "安静时光", emoji: "🍃" },
  { id: "lively", label: "热闹非凡", emoji: "🎉" },
  { id: "date", label: "浪漫约会", emoji: "💕" },
  { id: "random", label: "随机冒险", emoji: "🎲" },
];

// 时间选项
const TIME_OPTIONS = [
  { id: "now", label: "现在出发" },
  { id: "tonight", label: "今晚计划" },
  { id: "weekend", label: "周末探索" },
];

export default function ExplorePage() {
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set(["coffee", "exhibition", "music"]));
  const [selectedMood, setSelectedMood] = useState<string>("solo");
  const [selectedTime, setSelectedTime] = useState<string>("tonight");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // 生成随机脉冲点
  const [pulseDots] = useState(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      style: {
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 4}s`,
      },
    }))
  );

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExplore = async () => {
    if (selectedInterests.size === 0) {
      // 晃动效果提示用户选择
      return;
    }

    setIsGenerating(true);

    // 模拟 API 调用
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setIsGenerating(false);
    setShowResults(true);

    // 滚动到结果区域
    setTimeout(() => {
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  return (
    <div className="explore-page">
      {/* 背景动效 */}
      <div className="pulse-bg">
        <div className="city-grid" />
        <div className="pulse-dots">
          {pulseDots.map((dot) => (
            <div
              key={dot.id}
              className="pulse-dot"
              style={dot.style}
            />
          ))}
        </div>
      </div>

      {/* Hero 区域 */}
      <section className="explorer-hero">
        <span className="hero-eyebrow">Project CitySense</span>
        <h1 className="hero-title">
          发现你的
          <span className="hero-title-accent">城市脉搏</span>
        </h1>
        <p className="hero-subtitle">
          告别"去哪儿"的困惑。小红书、豆瓣、B站的数万条城市信号，
          为你推荐独一无二的探索路线。
        </p>

        <div className="hero-scroll">
          <span className="hero-scroll-text">开始探索</span>
          <div className="hero-scroll-line" />
        </div>
      </section>

      {/* 兴趣选择区域 */}
      <section className="interest-section">
        <div className="section-header">
          <span className="section-label">Step 01</span>
          <h2 className="section-title">你今天想做什么？</h2>
          <p className="section-desc">选择你感兴趣的关键词，越多越精准</p>
        </div>

        <div className="interest-cloud">
          {INTERESTS.map((interest) => (
            <button
              key={interest.id}
              className={`interest-orb ${interest.size} ${selectedInterests.has(interest.id) ? "selected" : ""}`}
              onClick={() => toggleInterest(interest.id)}
              type="button"
            >
              {interest.label}
            </button>
          ))}
        </div>
      </section>

      {/* 心情选择区域 */}
      <section className="interest-section">
        <div className="section-header">
          <span className="section-label">Step 02</span>
          <h2 className="section-title">现在是什么心情？</h2>
          <p className="section-desc">我们会根据你的心情调整推荐风格</p>
        </div>

        <div className="mood-grid">
          {MOODS.map((mood) => (
            <button
              key={mood.id}
              className={`mood-card ${selectedMood === mood.id ? "selected" : ""}`}
              onClick={() => setSelectedMood(mood.id)}
              type="button"
            >
              <span className="mood-icon">{mood.emoji}</span>
              <span className="mood-label">{mood.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 时间选择区域 */}
      <section className="interest-section">
        <div className="section-header">
          <span className="section-label">Step 03</span>
          <h2 className="section-title">什么时候出发？</h2>
          <p className="section-desc">不同时间有不同的精彩</p>
        </div>

        <div className="mood-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {TIME_OPTIONS.map((time) => (
            <button
              key={time.id}
              className={`mood-card ${selectedTime === time.id ? "selected" : ""}`}
              onClick={() => setSelectedTime(time.id)}
              style={{ padding: "24px 16px" }}
              type="button"
            >
              <span className="mood-label">{time.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 探索按钮 */}
      <div className="explore-cta">
        <button
          className="explore-button"
          disabled={isGenerating || selectedInterests.size === 0}
          onClick={handleExplore}
          type="button"
        >
          <div className="explore-button-content">
            {isGenerating ? (
              <>
                <span className="explore-button-icon">⟳</span>
                正在探索城市信号...
              </>
            ) : (
              <>
                <span className="explore-button-icon">→</span>
                生成我的专属路线
              </>
            )}
          </div>
        </button>

        <div className="explore-hint">
          <span className="explore-hint-dot" />
          <span>已为你找到 128 个匹配地点</span>
        </div>

        <div style={{ marginTop: "24px" }}>
          <Link href="/" style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
            ← 返回工作台
          </Link>
        </div>
      </div>

      {/* 结果展示区域 */}
      {showResults && (
        <section id="results" className="route-reveal">
          <div className="section-header">
            <span className="section-label">你的专属路线</span>
            <h2 className="section-title">发现惊喜</h2>
          </div>

          <div style={{ display: "grid", gap: "24px" }}>
            {sampleRoutes.map((route, index) => (
              <div key={route.id} className="route-gift-card" style={{ animationDelay: `${index * 0.1}s` }}>
                <div className="route-gift-ribbon" />
                <img
                  src={route.image}
                  alt={route.title}
                  className="route-gift-image"
                />
                <div className="route-gift-content">
                  <h3 className="route-gift-title">{route.title}</h3>
                  <p className="route-gift-desc">{route.description}</p>
                  <div className="route-gift-meta">
                    {route.tags.map((tag) => (
                      <span key={tag} className="route-gift-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: "32px" }}>
            <Link
              href="/"
              className="explore-button"
              style={{ textDecoration: "none" }}
            >
              查看完整路线详情
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

// 示例路线数据（实际应从 API 获取）
const sampleRoutes = [
  {
    id: "1",
    title: "静安寺周边的文艺午后",
    description: "从网红咖啡开始，穿梭独立书店，最后在屋顶酒吧看日落。一条完美的 solo 探索路线。",
    image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80",
    tags: ["咖啡", "书店", "3小时", "￥150"],
  },
  {
    id: "2",
    title: "复兴西路的法式浪漫",
    description: "梧桐树下的艺术画廊，转角遇见复古小酒馆。适合约会的静谧下午。",
    image: "https://images.unsplash.com/photo-1544085311-11a028465b03?w=800&q=80",
    tags: ["艺术", "约会", "2.5小时", "￥200"],
  },
  {
    id: "3",
    title: "M50 的创意周末",
    description: "从莫干山路的艺术区开始，感受上海的创意脉动，最后的独立 Livehouse 演出是惊喜。",
    image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80",
    tags: ["展览", "音乐", "4小时", "￥180"],
  },
];
