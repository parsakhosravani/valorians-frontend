# Architecture

How Valorians Legend works under the hood. Read `CLAUDE.md` first; this file is the deep dive.

## The big picture

```
Telegram Mini App (browser)                     Server (Next.js API routes)               Database
───────────────────────────                     ───────────────────────────               ────────
templates/*.tsx  ── useGame() ──►  lib/api.ts ──►  app/api/**/route.ts                     Turso (libSQL)
      ▲                             (Authorization:      │  handler()/action()              or local SQLite
      │                              tma <initData>)     ▼                                  (DATABASE_PATH)
ResourceContext ◄── { serverTime, me, state } ◄── lib/game/* (pure rules) ── players.ts ──► users.state (JSON)
 (projects live                                    + server/* (I/O: db, bot, war, clans)    battles, attacks,
  numbers with advance())                                                                     clans, trades, …
```

- `src/lib/game/` is pure TypeScript shared by both sides. It never touches the DB or the network.
- `src/server/` does all I/O (DB, Telegram Bot API) and is `server-only`.
- `src/app/api/` routes are thin: parse the body, call a game function, return the player view.

## Sign-in

The Mini App sends Telegram's signed `initData` on every request as
`Authorization: tma <initData>`. `src/server/auth.ts` checks the HMAC with the bot token.
In a normal browser with `NEXT_PUBLIC_DEV_LOGIN=true`, `src/lib/api.ts` signs in as a local
test player instead (`?dev_user=N` picks which one).

## A request, step by step

1. `handler()` in `src/server/http.ts` authenticates and loads (or creates) the player.
2. If `resolveBattles` is set, it first fights this player's due battles and trades, and
   schedules a sweep of everyone else's with `after()` (runs after the response, at most every 5 s).
3. `action()` calls `mutatePlayer()`, which:
   - runs `advance(state, now)` to bring timers, production, training and queues up to `now`;
   - runs the route's pure function on that state;
   - saves with `UPDATE … WHERE id = ? AND version = ?` (optimistic locking) and retries up to
     8 times if another request saved in between.
4. The response is `playerView(player, now)` → `{ serverTime, me, state }`.
5. `GameError` → `400 { error, code }`; `AuthError` → `401`; anything else → `500` + log.

## Game state

- One JSON `GameState` per player in `users.state` (type in `src/lib/game/engine.ts`).
  A few values are copied to columns for ranking/search (`src/server/tribeColumns.ts`).
- `updatedAt` is the moment the numbers are true for. `advance()` moves them forward in time;
  that is how production, population, building queues, training and stamina all "tick".
- `normalizeState()` upgrades old saves by filling missing fields from `createInitialState()`.
- `getRates()` turns buildings, clan perks, Plus, etc. into per-hour rates and capacities.

## Client

- `ResourceContext.tsx` holds the last server state and keeps the numbers moving on screen
  between syncs using the same engine functions (`advance`, `getRates`).
- Taps in the Daily Mine apply instantly on screen and are sent in batches
  (`{ taps, crits, comboSum, frenzyTaps }`); the server caps them (speed, crit share, combo, Frenzy).
- Pages in `src/app/(routes)/` only render a template from `src/components/templates/`.

## War and battles

- Sending an army creates a march (`marchTo` in `src/server/war.ts`, rows in `attacks`).
  The battle happens **when the army arrives**, not when it is sent.
- `resolveDueAttacks(now, playerId?)` fights every arrived army using the pure rules in
  `src/lib/game/war.ts` / `battle.ts`, saves a report for both sides in `battles`, and
  notifies players through the bot (`src/server/notify.ts`).
- Reinforcements: while a village fights, its state holds `defending` (battle id + `joinBy`).
  `advance()` sends soldiers of a march returning before `joinBy` to `joining` instead of home;
  `joinReinforcements` (run first in each sweep) takes them and re-plans the battle with
  `reinforceBattle` in `battle.ts`. `finishBattle` / `abandon` close the window with `leaveField`.
- One battle per village at a time: an army that lands while the village is fighting stays
  `marching` and waits at the gates (`fieldClearAt`, re-checked under the defender's lock via
  `defending` → `field_busy`). Its battle starts when the earlier one ends, against everyone home.
- Battles get resolved by: the player's own requests, the post-response sweep, and the cron
  `GET /api/cron/battles`, called every 5 minutes by `.github/workflows/battles.yml`
  (also right after each production deploy). `CRON_SECRET` can protect it.
- The world map: positions, terrain, routes and sea travel in `src/lib/game/map.ts`;
  server placement in `src/server/map.ts`; drawn on a canvas in
  `src/components/organisms/war/` (`MapCanvas`, `MapGround` + `ground.worker.ts`, `useMapCamera`).
- Bandit lairs and raids on villages: `src/lib/game/bandits.ts`, `src/server/bandits.ts`,
  `src/server/banditRaids.ts`.

## Database

- `src/server/db.ts` creates every table on first use. A DB already at `SCHEMA_VERSION`
  skips setup (one query per cold start). **Bump `SCHEMA_VERSION` with every schema change.**
- Main tables: `users`, `battles`, `attacks`, `clans`, `clan_requests`, `clan_log`, `trades`,
  `bandit_lairs`, `announcements`, `payments`, `meta`.
- Turso when `TURSO_DATABASE_URL` is set (Vercel); otherwise a local SQLite file
  (Docker / own server — needs a persistent disk).

## Telegram bot

- Webhook: `src/app/api/bot/route.ts` → `src/server/bot.ts`. `/api/bot/setup` (re)registers it;
  the cron re-runs setup if the webhook is missing required update types.
- Announcements (`src/server/announce.ts`): admins `/announce` posts; after every production
  deploy the bot announces the merged PR titles (mode via `/releases`: auto, draft, off).
  Sending is batched (~25 msg/s) and continued by the cron.
- Valorians Plus (`src/server/plus.ts`): Telegram Stars subscription; payments stored by
  charge id in `payments` so a repeated update never counts twice.

## Deploy and CI

- Hosted on Vercel (live: `https://valorians-frontend.vercel.app`), Node 24, bun 1.4.4.
- `.github/workflows/ci.yml` runs typecheck, lint, test and build on every PR and on `main`.
- `NEXT_PUBLIC_*` values are baked in at build time — redeploy after changing them.

## When the game is down

Everything that can go wrong ends on **one error page**, `src/components/templates/ErrorPage.tsx`,
painted like the loading screen and always with a way forward:

| What failed | Who shows the page | Kind |
| --- | --- | --- |
| A screen crashed | `app/(routes)/error.tsx` | `crash` |
| The whole frame crashed | `app/global-error.tsx` | `crash` |
| A link to a page that doesn't exist | `app/(routes)/not-found.tsx` (+ the catch-all `[...missing]`) | `missing` |
| The server couldn't be reached on start | `LoadingScreen.tsx` | `offline` |
| Down on purpose: `MAINTENANCE=on` | `src/proxy.ts` → `app/(status)/maintenance` (API answers 503) | `maintenance` |
| The host is down, the project paused, or the last build failed | the **launcher** (`launcher/index.html`, GitHub Pages) | `down` |

None of the game's code runs when the host itself is down, so that last case needs a page that
lives elsewhere. The launcher asks `GET /api/health` (200 when the server and database answer),
then opens the game, keeping Telegram's `#tgWebAppData`, or shows the page and checks again every 20 s.

**Turning it on (once):** repo Settings → Pages → Source: GitHub Actions; merge to `main` (the
`Launcher` workflow publishes it); set `LAUNCHER_URL` on the host to the Pages URL and redeploy;
open `/api/bot/setup` so the bot's menu button points at it; and in BotFather `/myapps` → Edit Web
App URL → the launcher URL. Bot buttons (`webAppUrl()`) then go through the launcher; the bot's
webhook stays on the game.
