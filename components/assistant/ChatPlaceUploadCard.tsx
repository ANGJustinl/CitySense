"use client";

import { useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readJsonResponse } from "@/lib/http-response";

type Reservation = { path: string; token: string; image: { id: string } };

export function ChatPlaceUploadCard({ submissionId }: { submissionId: string }) {
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload() {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const reserve = await fetch(`/api/place-submissions/${submissionId}/images/reserve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mimeType: file.type }) });
      const slot = await readJsonResponse<Reservation>(reserve, "图片上传准备失败");
      const supabase = createSupabaseBrowserClient();
      const uploaded = await supabase.storage.from(process.env.NEXT_PUBLIC_CITYSENSE_SUBMISSION_ORIGINAL_BUCKET ?? "submission-originals").uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type });
      if (uploaded.error) throw uploaded.error;
      const complete = await fetch(`/api/place-submissions/${submissionId}/images/${slot.image.id}/complete`, { method: "POST" });
      await readJsonResponse(complete, "图片校验失败");
      const submit = await fetch(`/api/place-submissions/${submissionId}/submit`, { method: "POST" });
      const result = await readJsonResponse<{ status: string }>(submit, "地点提交失败");
      setMessage(result.status === "AUTO_PUBLISHED" ? "地点已发布" : "地点已提交审核");
    } catch (error) { setMessage(error instanceof Error ? error.message : "上传失败"); }
    finally { setBusy(false); }
  }

  return <div className="chat-upload-card">
    <label><ImagePlus size={16} /><span>{file ? file.name : "选择现场照片"}</span><input accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setFile(event.target.files?.[0])} type="file" /></label>
    <button disabled={!file || busy || Boolean(message && /已发布|已提交/.test(message))} onClick={() => void upload()} type="button">{busy ? <Loader2 className="spin" size={14} /> : null}上传并提交审核</button>
    {message ? <small>{message}</small> : null}
  </div>;
}
