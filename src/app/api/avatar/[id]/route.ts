import { NextRequest } from "next/server";

import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * A player's Telegram profile photo, fetched through the bot.
 *
 * The photo in Telegram's sign-in data is often missing (privacy settings,
 * Telegram Desktop), but the bot can read the profile photos of people who
 * use it. The bot token stays on the server: we fetch the image here and
 * stream it back, cached by the CDN for a day. Falls back to the photo URL
 * from sign-in, then to 404 (the app shows its default avatar).
 */
const tg = (
  token: string,
  method: string,
  params: Record<string, string | number>,
) =>
  fetch(
    `https://api.telegram.org/bot${token}/${method}?${new URLSearchParams(params as Record<string, string>)}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    },
  ).then((r) => r.json());

type PhotoSize = { file_id: string; width: number; height: number };

const CACHE_OK =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_MISS = "public, max-age=600, s-maxage=3600";

async function botPhoto(userId: number) {
  const token =
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;

  if (!token) return null;
  try {
    const photos = await tg(token, "getUserProfilePhotos", {
      user_id: userId,
      limit: 1,
    });
    const sizes: PhotoSize[] | undefined = photos?.ok
      ? photos.result?.photos?.[0]
      : undefined;

    if (!sizes?.length) return null;
    // Smallest size that still looks sharp in a 48px circle on a 3x screen.
    const pick =
      [...sizes]
        .sort((a, b) => a.width - b.width)
        .find((s) => s.width >= 160) ?? sizes[sizes.length - 1];
    const file = await tg(token, "getFile", { file_id: pick.file_id });
    const path: string | undefined = file?.ok
      ? file.result?.file_path
      : undefined;

    if (!path) return null;
    const img = await fetch(
      `https://api.telegram.org/file/bot${token}/${path}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!img.ok || !img.body) return null;

    return new Response(img.body, {
      headers: {
        "Content-Type": img.headers.get("content-type")?.startsWith("image/")
          ? img.headers.get("content-type")!
          : "image/jpeg",
        "Cache-Control": CACHE_OK,
      },
    });
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  const miss = () =>
    new Response(null, {
      status: 404,
      headers: { "Cache-Control": CACHE_MISS },
    });

  if (!Number.isSafeInteger(id) || id <= 0) return miss();
  // Only players of the game, so this can't be used to look up any Telegram user.
  const db = await getDb();
  const rs = await db.execute({
    sql: "SELECT photo_url FROM users WHERE id = ?",
    args: [id],
  });

  if (!rs.rows[0]) return miss();

  const fromBot = await botPhoto(id);

  if (fromBot) return fromBot;
  const signIn = rs.rows[0].photo_url;

  if (signIn) {
    return new Response(null, {
      status: 302,
      headers: { Location: String(signIn), "Cache-Control": CACHE_MISS },
    });
  }

  return miss();
}
