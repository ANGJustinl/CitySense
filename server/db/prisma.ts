import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * 把连接池参数追加到 DATABASE_URL。
 * 在 PrismaClient 初始化前修改 process.env.DATABASE_URL，
 * 不用运行时 datasources 覆盖（Prisma 6.x 会报 P6001 要求 prisma:// 协议）。
 */
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

const enrichedUrl = withPrismaPoolParams(process.env.DATABASE_URL);

if (enrichedUrl && enrichedUrl !== process.env.DATABASE_URL) {
  process.env.DATABASE_URL = enrichedUrl;
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
