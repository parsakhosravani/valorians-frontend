import clsx from "clsx";
import { Fragment } from "react";

/** Painted icons (public/images/icons/<name>.webp) that stand in for emoji in the UI. */
const ICON_BY_EMOJI: Record<string, string> = {
  "🛡️": "shield",
  "⚔️": "swords",
  "👑": "crown",
  "🎖️": "medal",
  "💀": "skull",
  "🎒": "loot",
  "⏱": "hourglass",
  "⏳": "hourglass",
  "🏆": "trophy",
  "💪": "power",
  "🔒": "lock",
  "🔭": "spyglass",
  "⛰️": "mountain",
  "🌲": "forest",
  "🌾": "plains",
  "🌊": "sea",
  "⚓": "anchor",
  "🐪": "camel",
  "🔥": "fire",
  "🗼": "watchtower",
  "🎁": "chest",
  "🏛️": "hall",
  "🚩": "banner",
  "🤝": "handshake",
  "👥": "members",
  "✉️": "letter",
  "💰": "coins",
  "📦": "crate",
  "🔨": "hammer",
  "🛤️": "road",
  "💧": "lake",
  "🎲": "dice",
  "🏰": "founded",
  "🚶": "footprints",
  "🚪": "door",
  "⚙️": "gears",
  "🏚️": "ruin",
  "🥇": "gold",
  "🥈": "silver",
  "🥉": "bronze",
  "📍": "compass",
  "🪙": "resources/coin",
  "⛵": "troops/longship",
  "🪓": "troops/axeman",
};

const iconSrc = (emoji: string) => {
  const name = ICON_BY_EMOJI[emoji] ?? ICON_BY_EMOJI[`${emoji}\uFE0F`];

  return name ? `/images/${name.includes("/") ? name : `icons/${name}`}.webp` : null;
};

/**
 * One emoji drawn as its painted icon, sized to the surrounding text.
 * Emoji without a painted icon are shown as they are.
 */
export const GameIcon = ({ e, className }: { e: string; className?: string }) => {
  const src = iconSrc(e);

  if (!src) return <>{e}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      aria-hidden="true"
      className={clsx("inline-block align-[-0.3em] w-[1.35em] h-[1.35em] rounded-[0.25em] object-cover", className)}
      draggable={false}
      src={src}
    />
  );
};

const EMOJI_RE = new RegExp(
  `(${Object.keys(ICON_BY_EMOJI)
    .flatMap((k) => [k, k.replace(/\uFE0F/g, "")])
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\uFE0F?`,
  "gu",
);

/** A string with every known emoji in it swapped for its painted icon. */
export const IconText = ({ text }: { text: string }) => (
  <>
    {text.split(EMOJI_RE).map((part, i) =>
      i % 2 ? <GameIcon e={part} key={i} /> : <Fragment key={i}>{part}</Fragment>,
    )}
  </>
);
