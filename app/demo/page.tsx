"use client";

import { useState } from "react";
import { MoodOrbSelector } from "@/components/explorer/MoodOrbSelector";
import { CityPulseLoader } from "@/components/explorer/CityPulseLoader";
import { GiftRouteCard } from "@/components/explorer/GiftRouteCard";

// 示例路线数据
const SAMPLE_ROUTES = [
  {
    id: "1",
    title: "静安寺周边的文艺午后",
    summary: "从网红咖啡开始，穿梭独立书店，最后在屋顶酒吧看日落。一条完美的 solo 探索路线。",
    description: "探索静安区的文艺氛围，从精品咖啡到独立书店，再到屋顶酒吧的日落时光。",
    image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80",
    places: [
      { name: "Element Coffee", area: "静安寺", tags: ["咖啡", "网红"] },
      { name: "1984 Bookstore", area: "静安寺", tags: ["书店", "复古"] },
      { name: "Rooftop Bar", area: "南京西路", tags: ["酒吧", "日落"] },
    ],
    tags: ["咖啡", "书店", "3小时", "￥150"],
    duration: "3小时",
    distance: "2.4km",
    score: 92,
  },
  {
    id: "2",
    title: "复兴西路的法式浪漫",
    summary: "梧桐树下的艺术画廊，转角遇见复古小酒馆。适合约会的静谧下午。",
    description: "沿着复兴西路漫步，感受上海的法式浪漫，从艺术画廊到复古小酒馆。",
    image: "https://images.unsplash.com/photo-1544085311-11a028465b03?w=800&q=80",
    places: [
      { name: "香格纳画廊", area: "复兴西路", tags: ["艺术", "展览"] },
      { name: "Le Petit Jardin", area: "复兴西路", tags: ["法餐", "浪漫"] },
    ],
    tags: ["艺术", "约会", "2.5小时", "￥200"],
    duration: "2.5小时",
    distance: "1.8km",
    score: 88,
  },
  {
    id: "3",
    title: "M50 的创意周末",
    summary: "从莫干山路的艺术区开始，感受上海的创意脉动，最后的独立 Livehouse 演出是惊喜。",
    description: "探索 M50 创意园，感受上海的创意脉动，从艺术画廊到独立 Livehouse 演出。",
    image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&q=80",
    places: [
      { name: "M50 创意园", area: "莫干山路", tags: ["艺术", "创意"] },
      { name: "育音堂", area: "凯旋路", tags: ["音乐", "Livehouse"] },
    ],
    tags: ["展览", "音乐", "4小时", "￥180"],
    duration: "4小时",
    distance: "5.2km",
    score: 85,
  },
];

export default function DemoPage() {
  const [showLoader, setShowLoader] = useState(false);
  const [loaderProgress, setLoaderProgress] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [selectedMood, setSelectedMood] = useState<string>("solo");

  const handleExplore = () => {
    setShowLoader(true);
    setLoaderProgress(0);

    // 模拟加载进度
    const interval = setInterval(() => {
      setLoaderProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 15 + 5;
      });
    }, 300);

    // 3秒后显示结果
    setTimeout(() => {
      clearInterval(interval);
      setLoaderProgress(100);
      setTimeout(() => {
        setShowLoader(false);
        setShowResults(true);
      }, 500);
    }, 3000);
  };

  return (
    <div className="demo-page">
      {/* 背景 */}
      <div className="pulse-bg">
        <div className="city-grid" />
      </div>

      {/* 页面标题 */}
      <div style={{ textAlign: "center", padding: "60px 24px 40px" }}>
        <span className="hero-eyebrow">Component Demo</span>
        <h1 className="hero-title" style={{ fontSize: "clamp(32px, 5vw, 48px)" }}>
          探索组件展示
        </h1>
        <p className="hero-subtitle">
          CitySense 的趣味化交互组件演示
        </p>
      </div>

      {/* 1. Mood Orb Selector */}
      <section className="interest-section">
        <div className="section-header">
          <span className="section-label">Component 01</span>
          <h2 className="section-title">心情选择器</h2>
          <p className="section-desc">点击选择你现在的状态</p>
        </div>

        <MoodOrbSelector
          value={selectedMood as any}
          onChange={(mood) => setSelectedMood(mood)}
        />

        <div style={{ textAlign: "center", marginTop: "24px", color: "#5a6e6b", fontSize: "14px" }}>
          已选择：<strong>{selectedMood}</strong>
        </div>
      </section>

      {/* 2. Pulse Loader */}
      <section className="interest-section">
        <div className="section-header">
          <span className="section-label">Component 02</span>
          <h2 className="section-title">脉冲加载器</h2>
          <p className="section-desc">城市信号探索时的加载动效</p>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginBottom: "24px" }}>
          <button
            className="explore-button"
            onClick={handleExplore}
            style={{ padding: "12px 24px", fontSize: "14px" }}
            type="button"
          >
            {showLoader ? "加载中..." : "演示加载效果"}
          </button>

          {showResults && (
            <button
              className="secondary-button"
              onClick={() => {
                setShowResults(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              style={{
                padding: "12px 24px",
                fontSize: "14px",
                background: "white",
                border: "1px solid #087f7a",
                borderRadius: "999px",
                cursor: "pointer",
              }}
              type="button"
            >
              重置演示
            </button>
          )}
        </div>

        {showLoader && (
          <CityPulseLoader
            progress={loaderProgress}
            messages={[
              "正在扫描小红书信号...",
              "分析豆瓣活动数据...",
              "计算最优路线...",
              "获取实时交通...",
              "生成你的专属探索路线...",
            ]}
          />
        )}
      </section>

      {/* 3. Gift Route Cards */}
      {showResults && (
        <section className="route-reveal">
          <div className="section-header">
            <span className="section-label">Component 03</span>
            <h2 className="section-title">礼物式路线卡片</h2>
            <p className="section-desc">点击展开按钮查看路线详情</p>
          </div>

          <div style={{ display: "grid", gap: "24px" }}>
            {SAMPLE_ROUTES.map((route, index) => (
              <GiftRouteCard
                key={route.id}
                route={route}
                index={index}
                delay={index * 0.15}
              />
            ))}
          </div>
        </section>
      )}

      {/* 返回链接 */}
      <div style={{ textAlign: "center", padding: "40px 24px" }}>
        <a
          href="/"
          style={{
            fontSize: "14px",
            color: "#5a6e6b",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          ← 返回主页
        </a>
      </div>
    </div>
  );
}
