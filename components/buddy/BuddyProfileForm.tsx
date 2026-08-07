"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ArrowLeft, MapPin, MessageSquareQuote, Save, ShieldCheck, UserRound } from "lucide-react";
import { BuddyAvatar } from "@/components/buddy/BuddyEditorial";
import type { BuddyPublicProfileView } from "@/server/buddy/types";

export function BuddyProfileForm({ returnTo = "/buddy" }: { returnTo?: string }) {
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("上海");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/buddy/profile", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then(({ profile }: { profile?: BuddyPublicProfileView | null }) => {
        if (!profile) return;
        setName(profile.displayName);
        setBio(profile.bio ?? "");
        setCity(profile.city ?? "上海");
        setAvatarUrl(profile.avatarUrl);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/buddy/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: name, avatarUrl, bio: bio || null, city: city || null }),
    });
    setSaving(false);
    if (response.ok) {
      setMessage("公开资料已保存");
      window.location.href = returnTo;
    } else {
      setMessage(((await response.json()) as { error?: string }).error ?? "保存失败");
    }
  }

  const previewProfile: BuddyPublicProfileView = {
    userId: "preview",
    displayName: name.trim() || "你的公开昵称",
    avatarUrl,
    bio: bio.trim() || null,
    city: city.trim() || null,
  };

  return (
    <section className="buddy-profile-editorial">
      <header className="buddy-editorial-backbar"><a href={returnTo}><ArrowLeft aria-hidden="true" size={16} />返回搭子广场</a><span><ShieldCheck aria-hidden="true" size={15} />只展示你主动填写的内容</span></header>
      <div className="buddy-profile-spread">
        <aside className="buddy-profile-preview">
          <p className="buddy-folio-kicker">PUBLIC PROFILE · 公开小志</p>
          <span className="buddy-profile-preview-index" aria-hidden="true">P / 01</span>
          <BuddyAvatar profile={previewProfile} size="large" />
          <h1>{previewProfile.displayName}</h1>
          <span className="buddy-profile-city"><MapPin aria-hidden="true" size={14} />{previewProfile.city ?? "城市待填写"}</span>
          <blockquote>{previewProfile.bio ?? "写一句让同路人认识你的话。"}</blockquote>
          <p className="buddy-profile-preview-note">别人会在路线邀请、申请来信与共同群组中看到这张公开资料。</p>
        </aside>

        <form className="buddy-profile-form" onSubmit={submit}>
          <header><p className="buddy-folio-kicker">EDIT YOUR NOTES</p><h2>让对方先认识真实的你</h2><p>邮箱、内部画像和负向偏好不会出现在公开资料中。</p></header>
          <label><span><UserRound aria-hidden="true" size={15} />公开昵称</span><input autoComplete="nickname" maxLength={30} minLength={2} onChange={(event) => setName(event.target.value)} placeholder="至少 2 个字" required value={name} /></label>
          <label><span><MapPin aria-hidden="true" size={15} />常驻城市</span><input autoComplete="address-level1" maxLength={40} onChange={(event) => setCity(event.target.value)} placeholder="例如：北京" value={city} /></label>
          <label><span><MessageSquareQuote aria-hidden="true" size={15} />一句话介绍</span><textarea maxLength={200} onChange={(event) => setBio(event.target.value)} placeholder="例如：看展会慢慢逛，咖啡店愿意多坐一会儿。" value={bio} /><small>{bio.length} / 200</small></label>
          <button disabled={saving} type="submit"><Save aria-hidden="true" size={16} />{saving ? "正在保存…" : "保存公开资料"}</button>
          {message ? <p className="buddy-form-message" role="status">{message}</p> : null}
        </form>
      </div>
    </section>
  );
}
