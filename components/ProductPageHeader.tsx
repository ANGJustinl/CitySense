import { ProductHeader, type ProductChannel } from "@/components/ProductHeader";
import { getOptionalUser } from "@/server/auth/current-user";

export async function ProductPageHeader({ active, city = "北京" }: { active: ProductChannel; city?: string }) {
  const viewer = await getOptionalUser();
  return <ProductHeader active={active} city={city} viewer={viewer ? { id: viewer.appUser.id, email: viewer.authUser.email ?? null, role: viewer.appUser.role } : null} />;
}
