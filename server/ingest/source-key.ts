import { createHash } from "node:crypto";
import type { RawSourceItemDetail } from "@/server/sources/source.types";

function stableHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function createSourceKey(item: Pick<RawSourceItemDetail, "source" | "sourceId" | "sourceUrl" | "title" | "city" | "area" | "publishedAt">) {
  const identity =
    item.sourceId ??
    stableHash(
      item.sourceUrl ??
        [item.title, item.city ?? "", item.area ?? "", item.publishedAt ?? ""].join("|")
    );

  return `${item.source}:${identity}`;
}
