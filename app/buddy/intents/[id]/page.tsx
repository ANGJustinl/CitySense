import { BuddyIntentDetailClient } from "@/components/buddy/BuddyIntentDetailClient";
export default async function BuddyIntentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <main className="buddy-page-shell detail"><BuddyIntentDetailClient id={id} /></main>; }
