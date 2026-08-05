"use client";

import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";

type ChatDockProps = {
  open: boolean;
  onToggle: () => void;
  hasUnread?: boolean;
};

export function ChatDock({ open, onToggle, hasUnread }: ChatDockProps) {
  // 用 Portal 渲染到 body 末尾,脱离首页全屏地图的层叠上下文,
  // 确保按钮始终可点击(不被 AMap 注入的交互层拦截)。
  if (typeof document === "undefined") return null;
  return createPortal(
    <button
      type="button"
      className="chat-dock"
      onClick={onToggle}
      aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"}
    >
      {open ? <X size={22} /> : <Sparkles size={22} />}
      {hasUnread && !open ? <span className="chat-dock-badge" /> : null}
    </button>,
    document.body
  );
}

