/** Portraits players can pick instead of their Telegram photo. Art lives in public/images/avatars. */
export const AVATARS = [
  { id: "jarl", name: "Jarl" },
  { id: "shieldbearer", name: "Shieldbearer" },
  { id: "skald", name: "Skald" },
  { id: "warlord", name: "Warlord" },
  { id: "frost-dragon", name: "Frost Dragon" },
  { id: "storm-dragon", name: "Storm Dragon" },
] as const;

export type AvatarId = (typeof AVATARS)[number]["id"];

export const isAvatarId = (v: unknown): v is AvatarId =>
  AVATARS.some((a) => a.id === v);

export const avatarSrc = (id: AvatarId) => `/images/avatars/${id}.webp`;

/**
 * SQL for the picture to show: the picked portrait, else the Telegram photo.
 * Only ids from AVATARS are ever stored, so concatenating is safe.
 */
export const SHOWN_PHOTO_SQL =
  "CASE WHEN avatar IS NOT NULL THEN '/images/avatars/' || avatar || '.webp' ELSE photo_url END AS photo_url";
