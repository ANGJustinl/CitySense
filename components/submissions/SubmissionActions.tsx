"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SubmissionActions({ id, version, status, technicalFlags = [] }: { id: string; version: number; status: string; technicalFlags?: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const editable = ["DRAFT", "CHANGES_REQUESTED", "REJECTED", "AUTO_PUBLISHED", "APPROVED"].includes(status);
  const deletable = !["WITHDRAWN", "REMOVED"].includes(status);
  const retryable = status === "NEEDS_REVIEW" && technicalFlags.length > 0;

  async function mutate(url: string, method: string) {
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: version }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "操作失败");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  }

  return <div className="submission-actions">
    {editable ? <a className="secondary-button" href={`/my-submissions/${id}/edit`}>编辑</a> : null}
    {status === "DRAFT" || status === "CHANGES_REQUESTED" || status === "REJECTED" ? <button className="primary-button" disabled={busy} onClick={() => mutate(`/api/place-submissions/${id}/submit`, "POST")} type="button">{busy ? "处理中…" : "重新提交"}</button> : null}
    {retryable ? <button className="primary-button" disabled={busy} onClick={() => mutate(`/api/place-submissions/${id}/retry`, "POST")} type="button">{busy ? "处理中…" : "重试处理"}</button> : null}
    {deletable ? <button className="secondary-button" disabled={busy} onClick={() => { if (window.confirm("确定撤回这条投稿吗？")) void mutate(`/api/place-submissions/${id}`, "DELETE"); }} type="button">撤回投稿</button> : null}
    {error ? <p className="submit-place-error" role="alert">{error}</p> : null}
  </div>;
}
