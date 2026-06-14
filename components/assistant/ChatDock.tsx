"use client";

import { Sparkles, X } from "lucide-react";

type ChatDockProps = {
  open: boolean;
  onToggle: () => void;
  hasUnread?: boolean;
};

export function ChatDock({ open, onToggle, hasUnread }: ChatDockProps) {
  return (
    <button
      type="button"
      className="chat-dock"
      onClick={onToggle}
      aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"}
    >
      {open ? <X size={22} /> : <Sparkles size={22} />}
      {hasUnread && !open ? <span className="chat-dock-badge" /> : null}
    </button>
  );
}
