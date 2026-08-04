"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

type Submission = { id: string; name: string; status: string; version: number; city: string; area?: string | null; address: string; publicStatusMessage?: string | null; resultingVenue?: { id: string; publicationStatus: string } | null };

export function SubmissionAdminTable({ initialSubmissions }: { initialSubmissions: Submission[] }) {
  const [items, setItems] = useState(initialSubmissions);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function decision(item: Submission, value: "APPROVE_AS_NEW" | "REJECT") {
    const reason = value === "REJECT" ? window.prompt("拒绝原因") : undefined;
    if (value === "REJECT" && !reason) return;
    setBusy(item.id); setError(undefined);
    try {
      const res = await fetch(`/api/admin/place-submissions/${item.id}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: value, expectedVersion: item.version, reason }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "操作失败");
      setItems((all) => all.map((candidate) => candidate.id === item.id ? body : candidate));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(undefined); }
  }

  async function removeVenue(item: Submission) {
    if (!item.resultingVenue || !window.confirm("确认下架这个地点？")) return;
    const reason = window.prompt("下架原因") ?? "管理员下架";
    setBusy(item.id);
    try {
      const res = await fetch(`/api/admin/venues/${item.resultingVenue.id}/publication`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "REMOVED", reason }) });
      if (!res.ok) throw new Error((await res.json()).error || "下架失败");
      setItems((all) => all.map((candidate) => candidate.id === item.id ? { ...candidate, resultingVenue: { ...item.resultingVenue!, publicationStatus: "REMOVED" } } : candidate));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "下架失败"); }
    finally { setBusy(undefined); }
  }

  return <div>{error ? <p className="profile-error">{error}</p> : null}<div className="source-table enhanced"><div className="source-table-row source-table-header"><span>状态</span><span>地点</span><span>地址</span><span>操作</span></div>{items.map((item) => <div className="source-table-row" key={item.id}><span>{item.status}</span><span><strong>{item.name}</strong><small>{item.city} · {item.area}</small></span><span>{item.address}</span><span className="admin-submission-actions">{busy === item.id ? <Loader2 className="spin" size={16} /> : <>{["NEEDS_REVIEW", "SUBMITTED"].includes(item.status) ? <><button onClick={() => decision(item, "APPROVE_AS_NEW")} type="button">通过</button><button onClick={() => decision(item, "REJECT")} type="button">拒绝</button></> : null}{item.resultingVenue?.publicationStatus === "PUBLISHED" ? <button className="danger" onClick={() => removeVenue(item)} type="button"><Trash2 size={14} />下架</button> : null}</>}</span></div>)}</div></div>;
}
