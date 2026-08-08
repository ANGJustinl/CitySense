import { BuddyIntentDetailClient } from "@/components/buddy/BuddyIntentDetailClient";
import { ProductPageHeader } from "@/components/ProductPageHeader";
export default async function BuddyIntentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <main className="buddy-page-shell detail"><ProductPageHeader active="buddy" /><BuddyIntentDetailClient id={id} /></main>; }
