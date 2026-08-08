import { BuddyGroupClient } from "@/components/buddy/BuddyGroupClient";
import { ProductPageHeader } from "@/components/ProductPageHeader";
import { requireUser } from "@/server/auth/current-user";

export default async function BuddyGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  return <main className="buddy-page-shell group"><ProductPageHeader active="buddy" /><BuddyGroupClient id={id} viewerId={user.appUser.id} /></main>;
}
