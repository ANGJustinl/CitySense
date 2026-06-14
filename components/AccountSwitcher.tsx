"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { DEMO_USERS, findDemoUser } from "@/lib/demo-users";

const STORAGE_KEY = "cs-userId";

/**
 * 全局账号切换器：头像按钮 + 弹出菜单。
 *
 * 点头像弹出下拉菜单，列出 user1/user2，每项显示头像/名字/人设摘要。
 * 选中后写 localStorage + 触发 onChange，由宿主决定刷新方式。
 *
 * 账号恢复由 URL searchParams 驱动（首页/画像页服务端读 ?userId=），
 * 本组件不读 localStorage，只写——保持纯 UI，避免 effect-setState 循环。
 */
export function AccountSwitcher({
  currentUserId,
  onChange
}: {
  currentUserId: string;
  onChange: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点菜单外部关闭。
  useEffect(() => {
    if (!open) return;
    function handleOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function handleSelect(userId: string) {
    setOpen(false);
    if (userId === currentUserId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, userId);
    } catch {
      // 忽略写入失败。
    }
    onChange(userId);
  }

  const activeUser = findDemoUser(currentUserId) ?? DEMO_USERS[0];

  return (
    <div className="account-switcher" ref={containerRef}>
      <button
        type="button"
        className="account-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={activeUser.blurb}
      >
        <span className={`account-avatar persona-${activeUser.persona}`}>
          {activeUser.label.charAt(0)}
        </span>
        <span className="account-trigger-text">
          <span className="account-name">{activeUser.label}</span>
          <span className="account-persona">{personaLabel(activeUser.persona)}</span>
        </span>
        <ChevronDown size={14} className="account-caret" />
      </button>

      {open ? (
        <div className="account-menu" role="menu">
          <div className="account-menu-header">切换 demo 账号</div>
          {DEMO_USERS.map((user) => {
            const isActive = user.userId === currentUserId;
            return (
              <button
                key={user.userId}
                type="button"
                className={`account-menu-item${isActive ? " active" : ""}`}
                onClick={() => handleSelect(user.userId)}
                role="menuitemradio"
                aria-checked={isActive}
              >
                <span className={`account-avatar small persona-${user.persona}`}>
                  {user.label.charAt(0)}
                </span>
                <span className="account-menu-text">
                  <span className="account-name">{user.label}</span>
                  <span className="account-blurb">{user.blurb}</span>
                </span>
                {isActive ? <Check size={14} className="account-check" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function personaLabel(persona: string) {
  return persona === "quiet-culture"
    ? "文艺静思"
    : persona === "lively-trend"
      ? "热闹潮流"
      : persona;
}
