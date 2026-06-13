import assert from "node:assert/strict";
import test from "node:test";
import { withPrismaPoolParams } from "@/server/db/prisma";

test("prisma datasource url appends connection limit when configured", () => {
  const url = withPrismaPoolParams("postgresql://user:pass@example.com:5432/postgres", {
    connectionLimit: "1",
    poolTimeout: "20"
  });

  assert.equal(url, "postgresql://user:pass@example.com:5432/postgres?connection_limit=1&pool_timeout=20");
});

test("prisma datasource url preserves existing query params", () => {
  const url = withPrismaPoolParams("postgresql://user:pass@example.com:5432/postgres?sslmode=require", {
    connectionLimit: "2"
  });

  assert.equal(url, "postgresql://user:pass@example.com:5432/postgres?sslmode=require&connection_limit=2");
});
