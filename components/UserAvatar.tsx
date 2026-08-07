import type { CSSProperties } from "react";
import { defaultAvatarPosition } from "@/lib/default-avatar";

export function UserAvatar({
  avatarUrl,
  className = "",
  identity,
  name,
}: {
  avatarUrl?: string | null;
  className?: string;
  identity?: string | null;
  name?: string | null;
}) {
  const label = name?.trim() || "CitySense 用户";
  const position = defaultAvatarPosition(identity ?? name);
  const style = avatarUrl
    ? {
        backgroundImage: `url(${JSON.stringify(avatarUrl)})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }
    : {
        backgroundImage: "url(/images/avatars/citysense-default-avatar-atlas-v3.png)",
        backgroundPosition: `${position.x}% ${position.y}%`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "300% 300%",
      } as CSSProperties;

  return (
    <span
      aria-label={`${label}的头像`}
      className={`default-user-avatar ${avatarUrl ? "custom" : "generated"} ${className}`.trim()}
      data-avatar-index={avatarUrl ? undefined : position.index}
      role="img"
      style={style}
    />
  );
}
