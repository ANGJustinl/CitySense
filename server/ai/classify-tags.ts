const knownTags = ["展览", "咖啡", "书店", "漫画", "独立音乐", "夜生活", "约会", "安静"];

export async function classifyTags(text: string) {
  return knownTags.filter((tag) => text.includes(tag));
}
