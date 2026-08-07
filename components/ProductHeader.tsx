"use client";

import type { Route } from "next";
import Link from "next/link";
import { Activity, Bot, Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AuthNavigation, type AuthViewer } from "@/components/auth/AuthNavigation";

export type ProductChannel = "routes" | "community" | "buddy" | "submissions" | "about";

type ProductHeaderProps = {
  variant?: "map" | "page";
  active?: ProductChannel;
  viewer?: AuthViewer;
  city?: string;
  assistantOpen?: boolean;
  onAssistantToggle?: () => void;
  contextAction?: ReactNode;
};

const channels: Array<{ id: ProductChannel; label: string; href: string }> = [
  { id: "routes", label: "路线", href: "/" },
  { id: "community", label: "社区", href: "/community" },
  { id: "buddy", label: "搭子", href: "/buddy" },
  { id: "submissions", label: "投稿", href: "/submit-place" },
  { id: "about", label: "关于", href: "/about" }
];

export function ProductHeader({
  variant = "page",
  active,
  viewer = null,
  city = "北京",
  assistantOpen = false,
  onAssistantToggle,
  contextAction
}: ProductHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);

  return (
    <header className={`product-header product-header-${variant}`}>
      <Link aria-label="CitySense 首页" className="product-brand" href="/">
        <span className="product-brand-mark"><Activity size={19} /></span>
        <span><strong>CitySense{active === "buddy" ? <em> Buddy</em> : null}</strong><small>感知城市，再出发</small></span>
      </Link>

      <nav aria-label="产品导航" className={menuOpen ? "product-nav open" : "product-nav"}>
        {channels.map((channel) => (
          <Link
            aria-current={active === channel.id ? "page" : undefined}
            className={active === channel.id ? "active" : ""}
            href={(channel.id === "about" ? `/about?city=${encodeURIComponent(city)}` : channel.href) as Route}
            key={channel.id}
            onClick={() => setMenuOpen(false)}
          >
            {channel.label}
          </Link>
        ))}
      </nav>

      <div className="product-header-actions">
        {contextAction}
        {onAssistantToggle ? (
          <button
            aria-label={assistantOpen ? "关闭城市助手" : "打开城市助手"}
            aria-pressed={assistantOpen}
            className={assistantOpen ? "product-assistant active" : "product-assistant"}
            onClick={onAssistantToggle}
            type="button"
          >
            <Bot size={17} /><span>城市助手</span>
          </button>
        ) : null}
        <AuthNavigation viewer={viewer} />
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "关闭导航" : "打开导航"}
          className="product-menu-toggle"
          onClick={() => setMenuOpen((value) => !value)}
          type="button"
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
    </header>
  );
}
