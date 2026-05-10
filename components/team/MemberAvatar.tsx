"use client";

import { memberAvatarColor, memberAvatarInitial } from "@/utils/memberAvatar";
import { cabinetRoleLabelFr } from "@/utils/cabinetRoleFr";

type Props = {
  userId: string;
  displayName: string;
  role: string;
  sizePx?: number;
  className?: string;
};

export function MemberAvatar({
  userId,
  displayName,
  role,
  sizePx = 28,
  className = "",
}: Props) {
  const initial = memberAvatarInitial(displayName);
  const bg = memberAvatarColor(userId);
  const title = `${displayName} — ${cabinetRoleLabelFr(role)}`;

  return (
    <span
      title={title}
      className={[
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white shadow-sm ring-1 ring-black/10",
        className,
      ].join(" ")}
      style={{
        width: sizePx,
        height: sizePx,
        fontSize: Math.max(10, Math.round(sizePx * 0.38)),
        backgroundColor: bg,
      }}
      aria-label={title}
    >
      {initial}
    </span>
  );
}
