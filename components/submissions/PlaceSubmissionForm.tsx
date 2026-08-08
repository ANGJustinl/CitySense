"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, ImagePlus, Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { readJsonResponse } from "@/lib/http-response";
import { PlaceMapPicker, type PlaceCoordinate } from "@/components/submissions/PlaceMapPicker";
import {
  MAX_SUBMISSION_IMAGES,
  SUBMISSION_IMAGE_ACCEPT,
  uploadSubmissionImage,
  validateSubmissionImages
} from "@/components/submissions/submission-image-upload";

type Place = { id: string; name: string; address?: string; area?: string; lat?: number; lng?: number };
type Draft = { id: string; status: string; version?: number };
type SubmitStage = "idle" | "creating" | "uploading" | "validating" | "submitting";

type SubmissionInitial = {
  id: string;
  version: number;
  name: string;
  description: string | null;
  city: string;
  area: string | null;
  address: string;
  userLat: number | null;
  userLng: number | null;
  tags: string[];
  accessTips: string | null;
  selectedAmapPoiId: string | null;
  status: string;
};

type PlaceSubmissionFormProps = { initialSubmission?: SubmissionInitial; mode?: "create" | "edit" };


function friendlyUploadError(message: string) {
  if (/mime|format|类型|格式/i.test(message)) return "照片格式不支持，请选择 JPG、PNG 或 WebP。";
  if (/size|large|大小|超过/i.test(message)) return "照片太大了，请选择 10 MB 以内的图片。";
  if (/dimension|pixel|分辨率|尺寸/i.test(message)) return "照片尺寸太小，请选择短边至少 320 像素的图片。";
  return message;
}

export function PlaceSubmissionForm({ initialSubmission, mode = "create" }: PlaceSubmissionFormProps) {
  const [form, setForm] = useState({ name: initialSubmission?.name ?? "", description: initialSubmission?.description ?? "", city: initialSubmission?.city ?? "北京", area: initialSubmission?.area ?? "", address: initialSubmission?.address ?? "", tags: initialSubmission?.tags.join("，") ?? "", accessTips: initialSubmission?.accessTips ?? "", selectedAmapPoiId: initialSubmission?.selectedAmapPoiId ?? "" });
  const [coordinate, setCoordinate] = useState<PlaceCoordinate | undefined>(initialSubmission?.userLat != null && initialSubmission?.userLng != null ? { lat: initialSubmission.userLat, lng: initialSubmission.userLng } : undefined);
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [draft, setDraft] = useState<Draft | undefined>(initialSubmission ? { id: initialSubmission.id, status: initialSubmission.status, version: initialSubmission.version } : undefined);
  const [images, setImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [stage, setStage] = useState<SubmitStage>("idle");
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const idempotencyKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function choosePlace(place: Place) {
    setForm((value) => ({ ...value, name: place.name, address: place.address ?? value.address, area: place.area ?? value.area, selectedAmapPoiId: place.id }));
    setCoordinate(Number.isFinite(place.lat) && Number.isFinite(place.lng) ? { lat: place.lat as number, lng: place.lng as number } : undefined);
    setPlaces([]); setQuery(place.name);
  }

  function changeAddress(address: string) {
    setForm((value) => ({ ...value, address, selectedAmapPoiId: "" }));
    setCoordinate(undefined);
  }

  function changeCity(city: string) {
    setForm((value) => ({ ...value, city, selectedAmapPoiId: "" }));
    setCoordinate(undefined); setPlaces([]);
  }

  function chooseCoordinate(value: PlaceCoordinate) {
    setCoordinate(value);
    updateForm("selectedAmapPoiId", "");
  }

  function chooseImages(selected: File[]) {
    const result = validateSubmissionImages(selected, images.length);
    if (result.valid.length > 0) {
      setImages((current) => [...current, ...result.valid]);
      setPreviewUrls((current) => [...current, ...result.valid.map((file) => URL.createObjectURL(file))]);
    }
    setError(result.errors.length > 0 ? result.errors.join("；") : undefined);
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(previewUrls[index]);
    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPreviewUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function searchPlaces() {
    const term = query.trim() || form.name.trim();
    if (term.length < 2) return;
    setSearchBusy(true); setError(undefined);
    try {
      const res = await fetch(`/api/amap/places?city=${encodeURIComponent(form.city)}&query=${encodeURIComponent(term)}`);
      const body = await readJsonResponse<{ places?: Place[] }>(res, "地点搜索失败");
      setPlaces(body.places ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "地点搜索失败"); }
    finally { setSearchBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (images.length === 0) { setError("请至少上传一张现场照片。"); return; }
    setStage("creating"); setError(undefined); setMessage(undefined);
    try {
      const payload = { ...form, area: form.area || undefined, accessTips: form.accessTips || undefined, selectedAmapPoiId: form.selectedAmapPoiId || undefined, ...(coordinate ? { userLat: coordinate.lat, userLng: coordinate.lng } : {}), tags: form.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean) };
      const create = mode === "edit" && draft ? await fetch(`/api/place-submissions/${draft.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, expectedVersion: draft.version }) }) : await fetch("/api/place-submissions", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKeyRef.current ?? (idempotencyKeyRef.current = crypto.randomUUID()) },
        body: JSON.stringify(payload)
      });
      const submission = await readJsonResponse<Draft>(create, mode === "edit" ? "保存投稿失败" : "创建投稿失败");
      setDraft(submission);
      if (mode === "create") setStage("uploading");
      if (mode === "create") {
        for (const image of images) await uploadSubmissionImage(submission.id, image);
      }
      setStage("submitting");
      const final = await fetch(`/api/place-submissions/${submission.id}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: submission.version }) });
      const result = await readJsonResponse<Draft>(final, "提交投稿失败");
      setDraft(result); setMessage(result.status === "AUTO_PUBLISHED" ? "地点已自动发布到 CitySense。" : "投稿已提交，系统正在自动处理。 ");
    } catch (cause) { setError(friendlyUploadError(cause instanceof Error ? cause.message : "投稿失败")); setStage("idle"); }
    finally { setStage((current) => current === "submitting" && message ? "idle" : current); }
  }

  const submitting = stage !== "idle";
  const stageLabel = { idle: "提交这个地点", creating: "正在创建投稿…", uploading: "正在上传照片…", validating: "正在检查照片…", submitting: "正在提交…" }[stage];
  if (message) return <div className="submit-place-success"><CheckCircle2 size={42} /><p className="submit-place-kicker">FIELD NOTE RECEIVED</p><h2>这片城市切片，收到了。</h2><p>{message}</p><div><Link className="submit-place-button primary" href="/my-submissions">查看我的投稿<ArrowRight size={16} /></Link><Link className="submit-place-button quiet" href="/">返回工作台</Link></div></div>;

  return (
    <form className="submit-place-form" onSubmit={submit}>
      <section className="submit-place-section">
        <div className="submit-place-section-title"><span>01</span><div><h3>先说说这个地方</h3><p>不用完美，真实的体验比宣传语更有用。</p></div></div>
        <label className="submit-place-field"><span>地点名称 <em>*</em></span><input aria-describedby="place-name-hint" maxLength={60} minLength={2} onChange={(event) => { updateForm("name", event.target.value); updateForm("selectedAmapPoiId", ""); }} placeholder="例如：藏在弄堂里的独立书店" required value={form.name} /><small id="place-name-hint">2–60 个字 · {form.name.length}/60</small></label>
        <label className="submit-place-field"><span>推荐理由 <em>*</em></span><textarea aria-describedby="place-description-hint" maxLength={1000} minLength={10} onChange={(event) => updateForm("description", event.target.value)} placeholder="它特别在哪里？适合什么时候去？写 10 个字以上就好。" required rows={5} value={form.description} /><small id="place-description-hint">{form.description.length}/1000</small></label>
      </section>

      <section className="submit-place-section">
        <div className="submit-place-section-title"><span>02</span><div><h3>怎么找到它</h3><p>地址是必填，地图定位只是帮你更准确。</p></div></div>
        <div className="submit-place-grid"><label className="submit-place-field"><span>城市 <em>*</em></span><input maxLength={40} onChange={(event) => changeCity(event.target.value)} required value={form.city} /></label><label className="submit-place-field"><span>区域 <i>可选</i></span><input maxLength={40} onChange={(event) => updateForm("area", event.target.value)} placeholder="例如：东城区" value={form.area} /></label></div>
        <label className="submit-place-field"><span>详细地址 <em>*</em></span><input aria-describedby="place-address-hint" maxLength={200} minLength={5} onChange={(event) => changeAddress(event.target.value)} placeholder="写到门牌号、楼层或入口，会更容易找到" required value={form.address} /><small id="place-address-hint">至少 5 个字 · 地址改变后会清除旧地图定位</small></label>
        <div className="submit-place-map-block"><div className="submit-place-map-heading"><span>地图定位 <i>可选</i></span><small>适合小巷、楼层或不容易搜索到的入口</small></div><PlaceMapPicker onChange={chooseCoordinate} value={coordinate} /></div>
      </section>

      <section className="submit-place-section">
        <div className="submit-place-section-title"><span>03</span><div><h3>留下一组现场照片</h3><p>最多添加 5 张，让下一位探索者更容易认出它。</p></div></div>
        <div className={`submit-place-upload ${images.length > 0 ? "has-preview" : ""}`}>
          {previewUrls.length > 0 ? <div className="submit-place-upload-previews" aria-label="已选择的地点照片" role="list">{previewUrls.map((url, index) => <div key={url} role="listitem"><img alt={`地点照片 ${index + 1} 预览`} src={url} /><button aria-label={`移除第 ${index + 1} 张地点照片`} className="submit-place-icon-button" disabled={submitting} onClick={() => removeImage(index)} type="button"><X size={15} /></button></div>)}</div> : <ImagePlus size={28} />}
          <div><strong>添加现场照片</strong><small>已选择 {images.length}/5 张 · JPG、PNG 或 WebP · 每张 10 MB 内</small></div>
          <label className="submit-place-button quiet"><span>{images.length > 0 ? "继续添加" : "选择照片"}</span><input accept={SUBMISSION_IMAGE_ACCEPT} capture="environment" disabled={submitting || images.length >= MAX_SUBMISSION_IMAGES} multiple onChange={(event) => { chooseImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} type="file" /></label>
        </div>
      </section>

      <details className="submit-place-more"><summary><span><strong>再补充一点线索</strong><small>标签、访问提示和已有地图地点，全部可选</small></span><ChevronDown size={17} /></summary><div className="submit-place-more-body"><label className="submit-place-field"><span>标签 <i>可选</i></span><input maxLength={200} onChange={(event) => updateForm("tags", event.target.value)} placeholder="独立书店，安静，咖啡" value={form.tags} /></label><label className="submit-place-field"><span>访问提示 <i>可选</i></span><input maxLength={300} onChange={(event) => updateForm("accessTips", event.target.value)} placeholder="入口位置、营业时间或预约方式" value={form.accessTips} /></label><div className="submit-place-field"><span>关联已有地图地点 <i>可选</i></span><div className="submit-place-search"><input onChange={(event) => setQuery(event.target.value)} placeholder={form.name || "搜索地点名称"} value={query} /><button className="submit-place-button quiet" disabled={searchBusy} onClick={searchPlaces} type="button">{searchBusy ? <Loader2 className="spin" size={15} /> : <Search size={15} />}搜索</button></div></div>{form.selectedAmapPoiId ? <div className="submit-place-bound"><MapPin size={15} /><span>已关联：{query || form.name}</span><button aria-label="解除地图地点关联" onClick={() => updateForm("selectedAmapPoiId", "")} type="button"><X size={14} /></button></div> : null}{places.length > 0 ? <div className="submit-place-place-options">{places.map((place) => <button key={place.id} onClick={() => choosePlace(place)} type="button"><MapPin size={15} /><strong>{place.name}</strong><span>{place.address}</span></button>)}</div> : null}</div></details>

      <div className="submit-place-footer"><p>提交后会自动处理照片方向并移除 EXIF 位置信息。请确认你拥有发布这张照片和这些地点信息的权利。</p><div className="submit-place-checks"><span className={form.name.length >= 2 ? "done" : ""}>地点名称</span><span className={form.address.length >= 5 ? "done" : ""}>地址</span><span className={images.length > 0 ? "done" : ""}>现场照片</span></div><button className="submit-place-button primary" disabled={submitting} type="submit">{submitting ? <Loader2 className="spin" size={17} /> : <MapPin size={17} />}{stageLabel}</button>{error ? <p className="submit-place-error" role="alert">{error}</p> : null}<p aria-live="polite" className="submit-place-progress">{submitting ? stageLabel : draft ? `投稿草稿已创建：${draft.id.slice(0, 8)}…` : ""}</p></div>
    </form>
  );
}
