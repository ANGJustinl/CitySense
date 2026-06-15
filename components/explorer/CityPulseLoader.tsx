"use client";

import { useState, useEffect } from "react";

interface CityPulseLoaderProps {
  progress?: number;
  messages?: string[];
  onComplete?: () => void;
}

const DEFAULT_MESSAGES = [
  "正在扫描小红书信号...",
  "分析豆瓣活动数据...",
  "计算最优路线...",
  "获取实时交通...",
  "生成你的专属探索路线...",
];

export function CityPulseLoader({
  progress: externalProgress,
  messages = DEFAULT_MESSAGES,
  onComplete,
}: CityPulseLoaderProps) {
  const [internalProgress, setInternalProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState("");

  const progress = externalProgress ?? internalProgress;

  // 动画点数
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // 自动进度（当没有外部控制时）
  useEffect(() => {
    if (externalProgress !== undefined) return;

    const interval = setInterval(() => {
      setInternalProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 8 + 2;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [externalProgress]);

  // 消息切换
  useEffect(() => {
    const progressThresholds = messages.map((_, i) => (i + 1) * (100 / messages.length));

    const currentMessageIndex = progressThresholds.findIndex(
      (threshold) => progress < threshold
    );

    if (currentMessageIndex !== messageIndex && currentMessageIndex !== -1) {
      setMessageIndex(currentMessageIndex);
    }

    if (progress >= 100 && onComplete) {
      setTimeout(onComplete, 500);
    }
  }, [progress, messages, messageIndex, onComplete]);

  return (
    <div className="pulse-loader">
      {/* 脉冲圆圈 */}
      <div className="pulse-loader-circles">
        <div className="pulse-circle pulse-circle-1" />
        <div className="pulse-circle pulse-circle-2" />
        <div className="pulse-circle pulse-circle-3" />
        <div className="pulse-circle pulse-circle-4" />
      </div>

      {/* 城市图标 */}
      <div className="pulse-loader-icon">🏙️</div>

      {/* 消息 */}
      <p className="pulse-loader-message">
        {messages[messageIndex]}
        {dots}
      </p>

      {/* 进度条 */}
      <div className="pulse-loader-bar">
        <div
          className="pulse-loader-fill"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {/* 百分比 */}
      <span className="pulse-loader-percent">
        {Math.round(Math.min(progress, 100))}%
      </span>
    </div>
  );
}

/* ================================================
   Pulse Loader 样式
   ================================================ */

const loaderStyles = `
.pulse-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
  min-height: 400px;
}

.pulse-loader-circles {
  position: relative;
  width: 200px;
  height: 200px;
  margin-bottom: 32px;
}

.pulse-circle {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: var(--bg-pulse, #087f7a);
  animation: spin 2s linear infinite;
}

.pulse-circle-1 {
  inset: 0;
  opacity: 1;
}

.pulse-circle-2 {
  inset: 12px;
  opacity: 0.8;
  animation-duration: 1.8s;
  animation-direction: reverse;
  border-top-color: var(--accent-warm, #ff6b4a);
}

.pulse-circle-3 {
  inset: 24px;
  opacity: 0.6;
  animation-duration: 2.2s;
  border-top-color: var(--accent-electric, #00ffd5);
}

.pulse-circle-4 {
  inset: 36px;
  opacity: 0.4;
  animation-duration: 1.6s;
  animation-direction: reverse;
  border-top-color: #b78419;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.pulse-loader-icon {
  font-size: 48px;
  margin-bottom: 24px;
  animation: icon-bounce 2s ease-in-out infinite;
}

@keyframes icon-bounce {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-12px) scale(1.05); }
}

.pulse-loader-message {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary, #5a6e6b);
  text-align: center;
  margin-bottom: 24px;
  min-height: 24px;
}

.pulse-loader-bar {
  width: 280px;
  height: 6px;
  background: rgba(8, 127, 122, 0.1);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 16px;
}

.pulse-loader-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--bg-pulse, #087f7a), var(--accent-electric, #00ffd5));
  border-radius: 999px;
  transition: width 0.3s ease;
  position: relative;
}

.pulse-loader-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.pulse-loader-percent {
  font-size: 14px;
  font-weight: 800;
  color: var(--bg-pulse, #087f7a);
  letter-spacing: 0.1em;
}
`;

// 注入样式
if (typeof document !== "undefined" && !document.getElementById("pulse-loader-styles")) {
  const styleSheet = document.createElement("style");
  styleSheet.id = "pulse-loader-styles";
  styleSheet.textContent = loaderStyles;
  document.head.appendChild(styleSheet);
}
