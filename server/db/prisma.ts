import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function withPrismaPoolParams(
  url: string | undefined,
  options: { connectionLimit?: string; poolTimeout?: string } = {
    connectionLimit: process.env.DATABASE_CONNECTION_LIMIT,
    poolTimeout: process.env.DATABASE_POOL_TIMEOUT
  }
) {
  if (!url) {
    return url;
  }

  const params = [
    ["connection_limit", options.connectionLimit],
    ["pool_timeout", options.poolTimeout]
  ].filter(([key, value]) => {
    return typeof value === "string" && Boolean(value.trim()) && !url.includes(`${key}=`);
  });

  if (params.length === 0) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params
    .map(([key, value]) => `${key}=${encodeURIComponent(value ?? "")}`)
    .join("&")}`;
}

const datasourceUrl = withPrismaPoolParams(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    datasourceUrl
      ? {
          datasources: {
            db: {
              url: datasourceUrl
            }
          }
        }
      : undefined
  );

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
