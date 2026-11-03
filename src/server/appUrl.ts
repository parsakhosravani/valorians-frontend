import "server-only";

/**
 * The game's public address: the Mini App URL the bot's Play buttons, menu
 * button and webhook point at. APP_URL wins when set. Otherwise Vercel tells us
 * the project's production domain, so moving the game to a new Vercel project
 * or domain needs no code change: the first request on the new deploy
 * re-points the bot (see ensureBotSetup).
 */
export const appUrl = () => {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = process.env.APP_URL || (vercel ? `https://${vercel}` : "https://valorians-frontend.vercel.app");

  return url.replace(/\/$/, "");
};

/**
 * The address a Telegram button opens for `path`. With LAUNCHER_URL set (the
 * launcher on GitHub Pages, see launcher/index.html) buttons go through it: it
 * checks the game is up first and shows the error page when it isn't, even
 * when the host itself is down, paused, or its last build failed, where no
 * code of the game can run to say so. Without it, straight to the game.
 */
export const webAppUrl = (path = "") => {
  const launcher = (process.env.LAUNCHER_URL || "").replace(/\/$/, "");

  if (!launcher) return `${appUrl()}${path}`;

  return path && path !== "/" ? `${launcher}/?to=${encodeURIComponent(path)}` : `${launcher}/`;
};
