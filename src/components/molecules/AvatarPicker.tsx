"use client";
import { useState } from "react";
import clsx from "clsx";

import { Avatar } from "./Avatar";
import { Drawer } from "./Drawer";

import { useGame } from "@/context";
import { AVATARS, avatarSrc } from "@/lib/game/avatars";

/** Sheet for choosing your picture: your Telegram photo or one of the game's portraits. */
export const AvatarPicker = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { me, setAvatar } = useGame();
  const [saving, setSaving] = useState<string | null>(null);
  const current = me.avatar ?? "telegram";
  const hasPhoto = !!me.telegramPhotoUrl;

  const pick = async (id: string) => {
    if (id === current || saving) return;
    setSaving(id);
    const ok = await setAvatar(id === "telegram" ? null : id);

    setSaving(null);
    if (ok) onClose();
  };

  const Option = ({
    id,
    name,
    src,
    disabled,
    note,
  }: {
    id: string;
    name: string;
    src: string | null;
    disabled?: boolean;
    note?: string;
  }) => (
    <button
      aria-pressed={current === id}
      className={clsx(
        "flex flex-col items-center gap-1 rounded-2xl px-1 py-2 border-2 transition",
        current === id ? "border-gold bg-gold/10" : "border-line bg-buildingBg",
        disabled ? "opacity-50" : "active:scale-95",
        saving === id && "animate-pulse",
      )}
      disabled={disabled || !!saving}
      onClick={() => pick(id)}
    >
      <Avatar className="rounded-xl" size={60} src={src} />
      <span className="text-xs font-bold text-parch leading-tight text-center">
        {name}
      </span>
      {note && (
        <span className="text-[10px] text-muted leading-tight text-center">
          {note}
        </span>
      )}
      {current === id && !note && (
        <span className="text-[10px] font-bold text-goldtext">In use</span>
      )}
    </button>
  );

  return (
    <Drawer
      isOpen={isOpen}
      position="bottom"
      title="Choose your avatar"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 px-1 pb-2">
        <p className="text-sm text-sub text-center">
          This is how other chiefs see you on the map, in Friends and on the
          Leaderboard.
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          <Option
            disabled={!hasPhoto}
            id="telegram"
            name="Telegram photo"
            note={hasPhoto ? undefined : "Hidden or not set in Telegram"}
            src={me.telegramPhotoUrl}
          />
          {AVATARS.map((a) => (
            <Option key={a.id} id={a.id} name={a.name} src={avatarSrc(a.id)} />
          ))}
        </div>
      </div>
    </Drawer>
  );
};
