import { BuddyGroupClient } from "@/components/buddy/BuddyGroupClient";
export default async function BuddyGroupPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <main className="buddy-page-shell group"><BuddyGroupClient id={id} /></main>; }
