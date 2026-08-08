"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import {
  MAX_POST_IMAGES,
  CHAT_IMAGE_ACCEPT,
  uploadPostImage,
  validatePostImages
} from "@/components/assistant/chat-image-upload";

/** 手记已发布后,在聊天卡片内补充照片。镜像 ChatPlaceUploadCard,但走社区手记图片端点。 */
export function ChatPostUploadCard({ postId }: { postId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  function selectFiles(selected: File[]) {
    const result = validatePostImages(selected, files.length);
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
    setBusy(true);
    setMessage("");
    try {
      for (const file of files) await uploadPostImage(postId, file);
      setMessage("照片已添加到手记");
      files.forEach((_, index) => index < previewUrls.length && URL.revokeObjectURL(previewUrls[index]));
      setFiles([]);
      setPreviewUrls([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  const submitted = Boolean(message && message.includes("已添加"));
  return (
    <div className="chat-upload-card">
      <label>
        <ImagePlus size={16} />
        <span>补充照片（{files.length}/{MAX_POST_IMAGES}）</span>
        <input
          accept={CHAT_IMAGE_ACCEPT}
          capture="environment"
          disabled={busy || files.length >= MAX_POST_IMAGES}
          multiple
          onChange={(event) => {
            selectFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
          type="file"
        />
      </label>
      {previewUrls.length > 0 ? (
        <div aria-label="已选择的照片" className="chat-upload-previews" role="list">
          {previewUrls.map((url, index) => (
            <div key={url} role="listitem">
              <img alt={`照片 ${index + 1} 预览`} src={url} />
              <button
                aria-label={`移除第 ${index + 1} 张照片`}
                disabled={busy}
                onClick={() => removeFile(index)}
                type="button"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <button disabled={files.length === 0 || busy || submitted} onClick={() => void upload()} type="button">
        {busy ? <Loader2 className="spin" size={14} /> : null}
        {busy ? "正在上传…" : "上传照片"}
      </button>
      {message ? <small aria-live="polite" role={submitted ? undefined : "alert"}>{message}</small> : null}
    </div>
  );
}
