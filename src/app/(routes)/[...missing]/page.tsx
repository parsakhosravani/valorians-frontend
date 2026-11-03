import { notFound } from "next/navigation";

/**
 * Any address that isn't a screen lands here, so it gets the game's own
 * "lost" page (not-found.tsx) inside the game's layout instead of Next's plain
 * white 404, which looked broken inside Telegram.
 */
export default function Missing() {
  notFound();
}
