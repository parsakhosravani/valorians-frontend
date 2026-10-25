"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import clsx from "clsx";

import defaultAvatar from "~/images/avatar.webp";

/**
 * A player's picture. The server drops Telegram's generated letter tiles
 * (private or missing photos); anything that still fails to load falls back
 * to the game's own Viking avatar.
 */
const usable = (url?: string | null) => !!url;

export const Avatar = ({ src, size, className }: { src?: string | null; size: number; className?: string }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);
  const cls = clsx("object-cover shrink-0", className);

  if (usable(src) && !failed) {
    return (
      // Telegram avatars are remote; a plain img avoids next/image domain config.
      // eslint-disable-next-line @next/next/no-img-element
      <img alt="" className={cls} height={size} referrerPolicy="no-referrer" src={src!} style={{ width: size, height: size }} width={size} onError={() => setFailed(true)} />
    );
  }

  return <Image alt="" className={cls} height={size} src={defaultAvatar} style={{ width: size, height: size }} width={size} />;
};
