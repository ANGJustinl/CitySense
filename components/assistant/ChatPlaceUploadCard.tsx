"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import {
  MAX_SUBMISSION_IMAGES,
  SUBMISSION_IMAGE_ACCEPT,
  uploadSubmissionImage,
  validateSubmissionImages
} from "@/components/submissions/submission-image-upload";

export function ChatPlaceUploadCard({ submissionId }: { submissionId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  function selectFiles(selected: File[]) {
    const result = validateSubmissionImages(selected, files.length);
    if (result.valid.length > 0) {
      setFiles((current) => [...current, ...result.valid]);
      setPreviewUrls((current) => [...current, ...result.valid.map((file) => URL.createObjectURL(file))]);
    }
    setMessage(result.errors.join("；"));
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(previewUrls[index]);
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setPreviewUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function upload() {
    if (files.length === 0) return;
    setBusy(true); setMessage("");
    try {
      for (const file of files) await uploadSubmissionImage(submissionId, file);
      const submit = await fetch(`/api/place-submissions/${submissionId}/submit`, { method: "POST" });
      const result = await submit.json() as { status?: string; error?: string };
      if (!submit.ok) throw new Error(result.error || "地点提交失败");
      setMessage(result.status === "AUTO_PUBLISHED" ? "地点已发布" : "地点已提交审核");
    } catch (error) { setMessage(error instanceof Error ? error.message : "上传失败"); }
    finally { setBusy(false); }
  }

  const submitted = Boolean(message && /已发布|已提交/.test(message));
  return <div className="chat-upload-card">
    <label><ImagePlus size={16} /><span>添加现场照片（{files.length}/{MAX_SUBMISSION_IMAGES}）</span><input accept={SUBMISSION_IMAGE_ACCEPT} capture="environment" disabled={busy || files.length >= MAX_SUBMISSION_IMAGES} multiple onChange={(event) => { selectFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} type="file" /></label>
    {previewUrls.length > 0 ? <div aria-label="已选择的照片" className="chat-upload-previews" role="list">{previewUrls.map((url, index) => <div key={url} role="listitem"><img alt={`照片 ${index + 1} 预览`} src={url} /><button aria-label={`移除第 ${index + 1} 张照片`} disabled={busy} onClick={() => removeFile(index)} type="button"><X size={13} /></button></div>)}</div> : null}
    <button disabled={files.length === 0 || busy || submitted} onClick={() => void upload()} type="button">{busy ? <Loader2 className="spin" size={14} /> : null}{busy ? "正在上传…" : "上传并提交审核"}</button>
    {message ? <small aria-live="polite" role={submitted ? undefined : "alert"}>{message}</small> : null}
  </div>;
}
