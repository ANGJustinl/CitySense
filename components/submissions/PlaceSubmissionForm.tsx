"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ImagePlus, Loader2, MapPin, Search, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readJsonResponse } from "@/lib/http-response";
import { PlaceMapPicker, type PlaceCoordinate, type PlaceMapStatus } from "@/components/submissions/PlaceMapPicker";

type Place = { id: string; name: string; address?: string; area?: string; lat?: number; lng?: number };
type PlaceSearchResponse = { places?: Place[] };
type Draft = { id: string; status: string };
type ImageReservation = { path: string; token: string; image: { id: string } };

export function PlaceSubmissionForm() {
  const [form, setForm] = useState({ name: "", description: "", city: "北京", area: "", address: "", tags: "", accessTips: "", selectedAmapPoiId: "" });
  const [coordinate, setCoordinate] = useState<PlaceCoordinate>();
  const [mapStatus, setMapStatus] = useState<PlaceMapStatus>("loading");
  const [pinNeedsConfirmation, setPinNeedsConfirmation] = useState(false);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [image, setImage] = useState<File>();
  const [searchBusy, setSearchBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function searchPlaces() {
    const term = query.trim() || form.name.trim();
    if (term.length < 2) return;
    setSearchBusy(true); setError(undefined);
    try {
      const res = await fetch(`/api/amap/places?city=${encodeURIComponent(form.city)}&query=${encodeURIComponent(term)}`);
      const body = await readJsonResponse<PlaceSearchResponse>(res, "地点搜索失败");
      setPlaces(body.places ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "地点搜索失败"); }
    finally { setSearchBusy(false); }
  }

  function choosePlace(place: Place) {
    setForm((value) => ({ ...value, name: place.name, address: place.address ?? value.address, area: place.area ?? value.area, selectedAmapPoiId: place.id }));
    if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) setCoordinate({ lat: place.lat as number, lng: place.lng as number });
    setPinNeedsConfirmation(false); setPlaces([]); setQuery(place.name);
  }

  function changeAddress(address: string) {
    setForm((value) => ({ ...value, address, selectedAmapPoiId: "" }));
    if (coordinate) setPinNeedsConfirmation(true);
  }

  function chooseCoordinate(value: PlaceCoordinate) {
    setCoordinate(value);
    setPinNeedsConfirmation(false);
    setForm((current) => ({ ...current, selectedAmapPoiId: "" }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!image) { setError("请至少上传一张地点照片"); return; }
    if (mapStatus === "ready" && (!coordinate || pinNeedsConfirmation)) { setError(pinNeedsConfirmation ? "地址已修改，请在地图上重新确认位置" : "请在地图上标记地点位置"); return; }
    setSubmitting(true); setError(undefined); setMessage(undefined);
    try {
      const create = await fetch("/api/place-submissions", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({
          ...form,
          area: form.area || undefined,
          accessTips: form.accessTips || undefined,
          selectedAmapPoiId: form.selectedAmapPoiId || undefined,
          ...(coordinate ? { userLat: coordinate.lat, userLng: coordinate.lng } : {}),
          tags: form.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean)
        })
      });
      const submission = await readJsonResponse<Draft>(create, "创建投稿失败");
      setDraft(submission);
      const reserve = await fetch(`/api/place-submissions/${submission.id}/images/reserve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mimeType: image.type }) });
      const reserved = await readJsonResponse<ImageReservation>(reserve, "图片上传准备失败");
      const supabase = createSupabaseBrowserClient();
      const upload = await supabase.storage.from(process.env.NEXT_PUBLIC_CITYSENSE_SUBMISSION_ORIGINAL_BUCKET ?? "submission-originals").uploadToSignedUrl(reserved.path, reserved.token, image, { contentType: image.type });
      if (upload.error) throw upload.error;
      const complete = await fetch(`/api/place-submissions/${submission.id}/images/${reserved.image.id}/complete`, { method: "POST" });
      await readJsonResponse<unknown>(complete, "图片校验失败");
      const final = await fetch(`/api/place-submissions/${submission.id}/submit`, { method: "POST" });
      const result = await readJsonResponse<Draft>(final, "提交投稿失败");
      setDraft(result);
      setMessage(result.status === "AUTO_PUBLISHED" ? "地点已自动发布到 CitySense。" : "投稿已提交，管理员会继续处理。 ");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "投稿失败"); }
    finally { setSubmitting(false); }
  }

  if (message) return <div className="submission-success"><CheckCircle2 size={34} /><h2>提交成功</h2><p>{message}</p><Link className="primary-button" href="/my-submissions">查看我的投稿</Link></div>;

  return (
    <form className="submission-form submission-form-simple" onSubmit={submit}>
      <label className="field"><span>地点名称</span><input maxLength={60} minLength={2} onChange={(event) => setForm({ ...form, name: event.target.value, selectedAmapPoiId: "" })} placeholder="例如：藏在弄堂里的独立书店" required value={form.name} /></label>
      <label className="field"><span>详细地址</span><input minLength={5} onChange={(event) => changeAddress(event.target.value)} placeholder="请写到门牌号、楼层或入口" required value={form.address} /><small>地址越具体，系统定位越准确。</small></label>
      <div className="field submission-location-field"><span>在地图上标记位置</span><PlaceMapPicker needsConfirmation={pinNeedsConfirmation} onChange={chooseCoordinate} onStatusChange={setMapStatus} value={coordinate} /></div>
      <label className="field"><span>推荐理由</span><textarea maxLength={1000} minLength={20} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="它特别在哪里？适合什么时候去？至少写 20 字" required rows={6} value={form.description} /></label>
      <label className="submission-file"><ImagePlus size={20} /><span>{image ? image.name : "选择一张现场照片（JPEG/PNG/WebP）"}</span><input accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0])} type="file" /></label>

      <details className="submission-advanced">
        <summary><span><strong>高级选项</strong><small>城市、区域、标签、访问提示和高德地点绑定</small></span><ChevronDown size={17} /></summary>
        <div className="submission-advanced-body">
          <div className="submission-grid">
            <label className="field"><span>城市</span><input onChange={(event) => { setForm({ ...form, city: event.target.value, selectedAmapPoiId: "" }); if (coordinate) setPinNeedsConfirmation(true); setPlaces([]); }} required value={form.city} /></label>
            <label className="field"><span>区域（可选）</span><input onChange={(event) => setForm({ ...form, area: event.target.value })} value={form.area} /></label>
            <label className="field wide"><span>标签（可选，最多 8 个）</span><input onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="独立书店, 安静, 咖啡" value={form.tags} /></label>
            <label className="field wide"><span>访问提示（可选）</span><input onChange={(event) => setForm({ ...form, accessTips: event.target.value })} placeholder="例如入口位置、营业时间或预约方式" value={form.accessTips} /></label>
          </div>
          <div className="field"><span>绑定已有高德地点（可选）</span><div className="submission-search"><input onChange={(event) => setQuery(event.target.value)} placeholder={form.name || "地点名称"} value={query} /><button className="secondary-button" disabled={searchBusy} onClick={searchPlaces} type="button">{searchBusy ? <Loader2 className="spin" size={15} /> : <Search size={15} />}搜索</button></div></div>
          {form.selectedAmapPoiId ? <div className="submission-amap-bound"><MapPin size={15} /><span>已绑定高德地点：{query || form.name}</span><button aria-label="解除高德地点绑定" onClick={() => setForm({ ...form, selectedAmapPoiId: "" })} type="button"><X size={14} /></button></div> : null}
          {places.length > 0 ? <div className="submission-place-options">{places.map((place) => <button key={place.id} onClick={() => choosePlace(place)} type="button"><MapPin size={15} /><strong>{place.name}</strong><span>{place.address}</span></button>)}</div> : null}
        </div>
      </details>

      <p className="profile-status-note">图片只做格式、尺寸和去 EXIF 技术处理，不做内容审核；提交即表示你拥有发布权。</p>
      <button className="primary-button" disabled={submitting} type="submit">{submitting ? <Loader2 className="spin" size={18} /> : <MapPin size={18} />}提交地点</button>
      {draft ? <p>草稿编号：{draft.id}</p> : null}
      {error ? <p className="profile-error" role="alert">{error}</p> : null}
    </form>
  );
}
