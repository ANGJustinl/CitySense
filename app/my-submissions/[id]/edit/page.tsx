import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getOwnSubmission } from "@/server/submissions/service";
import { PlaceSubmissionForm } from "@/components/submissions/PlaceSubmissionForm";

export const dynamic = "force-dynamic";

export default async function EditSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const submission = await getOwnSubmission(user.appUser.id, id);
  if (!submission) notFound();
  return <main className="detail-shell"><PlaceSubmissionForm initialSubmission={submission} mode="edit" /></main>;
}
