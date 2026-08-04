import { prisma } from "@/server/db/prisma";
import { createSupabaseServerClient } from "@/server/auth/supabase-server";

export class AuthError extends Error {
  constructor(message: string, readonly status: 401 | 403 = 401) {
    super(message);
  }
}

function bootstrapRole(email: string | undefined) {
  const admins = (process.env.CITYSENSE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return email && admins.includes(email.toLowerCase()) ? "ADMIN" as const : "USER" as const;
}

export async function getOptionalUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const email = data.user.email;
  const appUser = await prisma.appUser.upsert({
    where: { id: data.user.id },
    create: {
      id: data.user.id,
      role: bootstrapRole(email),
      emailSnapshot: email,
      lastSignedInAt: new Date()
    },
    update: {
      emailSnapshot: email,
      lastSignedInAt: new Date()
    }
  });
  if (appUser.disabledAt) return null;
  return { authUser: data.user, appUser };
}

export async function requireUser() {
  const user = await getOptionalUser();
  if (!user) throw new AuthError("Authentication required", 401);
  if (!user.authUser.email_confirmed_at) throw new AuthError("Verified email required", 403);
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.appUser.role !== "ADMIN" && user.appUser.role !== "MODERATOR") {
    throw new AuthError("Administrator access required", 403);
  }
  return user;
}
