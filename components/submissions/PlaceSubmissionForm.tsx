"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ImagePlus, Loader2, MapPin, Search } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Place = { id: string; name: string; address?: string; area?: string; lat?: number; lng?: number };
type Draft = { id: string; status: string };

export function PlaceSubmissionForm() {
  const [form, setForm] = useState({ name: "", description: "", city: "上海", area: "", address: "", userLat: 31.23, userLng: 121.47, tags: "", accessTips: "", selectedAmapPoiId: "" });
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [image, setImage] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function searchPlaces() {
    if (query.trim().length < 2) return;
    setBusy(true); setError(undefined);
    try {
      const res = await fetch(`/api/amap/places?city=${encodeURIComponent(form.city)}&query=${encodeURIComponent(query)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "地点搜索失败");
      setPlaces(body.places ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "地点搜索失败"); }
    finally { setBusy(false); }
  }

  function choosePlace(place: Place) {
    setForm((value) => ({ ...value, name: place.name, address: place.address ?? value.address, area: place.area ?? value.area, userLat: place.lat ?? value.userLat, userLng: place.lng ?? value.userLng, selectedAmapPoiId: place.id }));
    setPlaces([]); setQuery(place.name);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!image) { setError("请至少上传一张地点照片"); return; }
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const create = await fetch("/api/place-submissions", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          ...form,
          area: form.area || undefined,
          accessTips: form.accessTips || undefined,
          selectedAmapPoiId: form.selectedAmapPoiId || undefined,
          tags: form.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean)
        })
      });
      const submission = await create.json();
      if (!create.ok) throw new Error(submission.error || "创建投稿失败");
      setDraft(submission);
      const reserve = await fetch(`/api/place-submissions/${submission.id}/images/reserve`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mimeType: image.type })
      });
      const reserved = await reserve.json();
      if (!reserve.ok) throw new Error(reserved.error || "图片上传准备失败");
      const supabase = createSupabaseBrowserClient();
      const upload = await supabase.storage.from(process.env.NEXT_PUBLIC_CITYSENSE_SUBMISSION_ORIGINAL_BUCKET ?? "submission-originals").uploadToSignedUrl(reserved.path, reserved.token, image, { contentType: image.type });
      if (upload.error) throw upload.error;
      const complete = await fetch(`/api/place-submissions/${submission.id}/images/${reserved.image.id}/complete`, { method: "POST" });
      if (!complete.ok) throw new Error((await complete.json()).error || "图片校验失败");
      const final = await fetch(`/api/place-submissions/${submission.id}/submit`, { method: "POST" });
      const result = await final.json();
      if (!final.ok) throw new Error(result.error || "提交失败");
      setDraft(result);
      setMessage(result.status === "AUTO_PUBLISHED" ? "地点已自动发布到 CitySense。" : "投稿已提交，管理员会继续处理。 ");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "投稿失败"); }
    finally { setBusy(false); }
  }

  if (message) return <div className="submission-success"><CheckCircle2 size={34} /><h2>提交成功</h2><p>{message}</p><Link className="primary-button" href="/my-submissions">查看我的投稿</Link></div>;

  return (
    <form className="submission-form" onSubmit={submit}>
      <div className="field"><span>先搜索高德地点（找不到可直接填写新地点）</span><div className="submission-search"><input onChange={(e) => setQuery(e.target.value)} placeholder="地点名称" value={query} /><button className="secondary-button" onClick={searchPlaces} type="button"><Search size={15} />搜索</button></div></div>
      {places.length > 0 ? <div className="submission-place-options">{places.map((place) => <button key={place.id} onClick={() => choosePlace(place)} type="button"><MapPin size={15} /><strong>{place.name}</strong><span>{place.address}</span></button>)}</div> : null}
      <div className="submission-grid">
        <label className="field"><span>地点名称</span><input required minLength={2} maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="field"><span>城市</span><input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
        <label className="field"><span>区域</span><input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></label>
        <label className="field wide"><span>完整地址</span><input required minLength={5} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label className="field"><span>纬度</span><input type="number" step="any" value={form.userLat} onChange={(e) => setForm({ ...form, userLat: Number(e.target.value) })} /></label>
        <label className="field"><span>经度</span><input type="number" step="any" value={form.userLng} onChange={(e) => setForm({ ...form, userLng: Number(e.target.value) })} /></label>
        <label className="field wide"><span>为什么值得去</span><textarea required minLength={20} maxLength={1000} rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="field wide"><span>标签（逗号分隔，最多 8 个）</span><input required value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="独立书店, 安静, 咖啡" /></label>
        <label className="field wide"><span>访问提示（可选）</span><input value={form.accessTips} onChange={(e) => setForm({ ...form, accessTips: e.target.value })} /></label>
        <label className="submission-file wide"><ImagePlus size={20} /><span>{image ? image.name : "选择一张现场照片（JPEG/PNG/WebP）"}</span><input accept="image/jpeg,image/png,image/webp" onChange={(e) => setImage(e.target.files?.[0])} type="file" /></label>
      </div>
      <p className="profile-status-note">图片只做格式、尺寸和去 EXIF 技术处理，不做内容审核；提交即表示你拥有发布权。</p>
      <button className="primary-button" disabled={busy} type="submit">{busy ? <Loader2 className="spin" size={18} /> : <MapPin size={18} />}提交地点</button>
      {draft ? <p>草稿编号：{draft.id}</p> : null}
      {error ? <p className="profile-error" role="alert">{error}</p> : null}
    </form>
  );
}
