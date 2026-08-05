"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  FileText,
  LogOut,
  MapPinPlus,
  MessagesSquare,
  ShieldCheck,
  UsersRound,
  UserRound
} from "lucide-react";
import { signOut } from "@/app/auth/actions";

export type AuthViewer = {
  id: string;
  email: string | null;
  role: "USER" | "MODERATOR" | "ADMIN";
} | null;

export function AuthNavigation({ viewer }: { viewer: AuthViewer }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!viewer) {
    return (
      <div className="auth-nav-entry" aria-label="账户授权">
        <Link className="auth-nav-login" href="/login?next=%2F">登录</Link>
        <Link className="auth-nav-register" href="/register?next=%2F">注册</Link>
      </div>
    );
  }

  const email = viewer.email ?? "CitySense 用户";
  const initial = email.charAt(0).toUpperCase();
  const canManage = viewer.role === "ADMIN" || viewer.role === "MODERATOR";

  return (
    <div className="auth-account" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="auth-account-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="auth-account-avatar">{initial}</span>
        <span className="auth-account-copy">
          <span>{email}</span>
          <small>CitySense 账户</small>
        </span>
        <ChevronDown aria-hidden="true" size={14} />
      </button>

      {open ? (
        <div className="auth-account-menu" role="menu">
          <div className="auth-account-menu-head">
            <UserRound size={16} />
            <span><strong>{email}</strong><small>已授权登录</small></span>
          </div>
          <Link href="/community" onClick={() => setOpen(false)} role="menuitem">
            <MessagesSquare size={16} />我的社区
          </Link>
          <Link href="/community/bookmarks" onClick={() => setOpen(false)} role="menuitem">
            <Bookmark size={16} />我的收藏
          </Link>
          <Link href="/buddy" onClick={() => setOpen(false)} role="menuitem">
            <UsersRound size={16} />我的搭子
          </Link>
          <Link href="/submit-place" onClick={() => setOpen(false)} role="menuitem">
            <MapPinPlus size={16} />分享地点
          </Link>
          <Link href="/my-submissions" onClick={() => setOpen(false)} role="menuitem">
            <FileText size={16} />我的投稿
          </Link>
          {canManage ? (
            <>
              <Link href="/admin/community" onClick={() => setOpen(false)} role="menuitem">
                <ShieldCheck size={16} />社区治理
              </Link>
              <Link href="/admin/sources" onClick={() => setOpen(false)} role="menuitem">
                <ShieldCheck size={16} />内容管理
              </Link>
            </>
          ) : null}
          <form action={signOut}>
            <button role="menuitem" type="submit"><LogOut size={16} />退出登录</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
