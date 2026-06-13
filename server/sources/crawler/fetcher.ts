import type { RawSourceItem } from "@/server/sources/source.types";

export async function fetchPublicSourcePage(url: string): Promise<RawSourceItem> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "CitySenseBot/0.1"
    }
  });

  return {
    id: `raw-${crypto.randomUUID()}`,
    source: "crawler",
    sourceUrl: url,
    title: url,
    content: await response.text(),
    status: response.ok ? "new" : "error",
    itemType: "event"
  };
}
