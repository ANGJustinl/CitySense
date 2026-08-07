export const DEFAULT_AVATAR_COUNT = 9;

export function defaultAvatarIndex(identity: string | null | undefined) {
  const source = identity?.trim() || "citysense-user";
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % DEFAULT_AVATAR_COUNT;
}

export function defaultAvatarPosition(identity: string | null | undefined) {
  const index = defaultAvatarIndex(identity);
  return {
    index,
    x: (index % 3) * 50,
    y: Math.floor(index / 3) * 50,
  };
}
