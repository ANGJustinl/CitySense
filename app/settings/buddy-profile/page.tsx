import { BuddyProfileForm } from "@/components/buddy/BuddyProfileForm";
import { ProductPageHeader } from "@/components/ProductPageHeader";
import { safeAuthNext } from "@/lib/auth/redirect";

export default async function BuddyProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <main className="buddy-page-shell detail"><ProductPageHeader active="buddy" /><BuddyProfileForm returnTo={safeAuthNext(params.next, "/buddy")} /></main>;
}
