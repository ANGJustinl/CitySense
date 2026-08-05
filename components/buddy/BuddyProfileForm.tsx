"use client";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Save, UserRound } from "lucide-react";

export function BuddyProfileForm({ returnTo = "/buddy" }: { returnTo?: string }) {
  const [name, setName] = useState(""); const [bio, setBio] = useState(""); const [city, setCity] = useState("上海"); const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/buddy/profile", { cache: "no-store" }).then((r) => r.json()).then(({ profile }) => { if (profile) { setName(profile.displayName); setBio(profile.bio ?? ""); setCity(profile.city ?? "上海"); } }); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); const response = await fetch("/api/buddy/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name, bio: bio || null, city: city || null }) }); if (response.ok) { setMessage("公开资料已保存"); window.location.href = returnTo; } else setMessage((await response.json()).error ?? "保存失败"); }
  return <section className="buddy-profile-editor"><a className="back-link" href={returnTo}><ArrowLeft size={16} />返回搭子广场</a><div className="buddy-profile-portrait"><span><UserRound size={32} /></span><div><p className="eyebrow">Public buddy profile</p><h1>让对方先认识真实的你</h1><p>这里只展示你主动填写的资料，不公开邮箱、内部画像和负向偏好。</p></div></div><form onSubmit={submit}><label><span>公开昵称</span><input minLength={2} maxLength={30} required value={name} onChange={(e) => setName(e.target.value)} /></label><label><span>常驻城市</span><input maxLength={40} value={city} onChange={(e) => setCity(e.target.value)} /></label><label><span>一句话介绍</span><textarea maxLength={200} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="例如：看展会慢慢逛，咖啡店愿意多坐一会儿" /></label><button className="primary-button" type="submit"><Save size={16} />保存公开资料</button>{message ? <p className="buddy-form-message">{message}</p> : null}</form></section>;
}
