# Valorians Legend

A Telegram Mini App game: tap to mine iron, wood, clay and crop, upgrade 24 buildings to grow your tribe, complete social quests and invite friends for bonuses.

This repo is the whole game — the Next.js frontend **and** its backend (API routes + a SQLite/Turso database). The server is authoritative: every tap, upgrade and reward is checked and saved on the server, so progress survives reloads and devices and can't be faked from the browser.

## How it works

| Piece | Where |
| --- | --- |
| Game rules and balance numbers (costs, rates, rewards) | `src/lib/game/config.ts` |
| Game engine — pure functions shared by server and client | `src/lib/game/engine.ts` |
| Telegram sign-in verification (initData HMAC) | `src/server/auth.ts` |
| Database (Turso or local SQLite, tables auto-created) and players | `src/server/db.ts`, `src/server/players.ts` |
| API routes | `src/app/api/*` |
| Client state, tap batching, live counters | `src/context/resource/ResourceContext.tsx` |

- **Sign-in:** the Mini App sends Telegram's signed `initData` on every request (`Authorization: tma <initData>`). The server checks the signature with your bot token, so nobody can play as someone else.
- **Saving** is safe under parallel requests: every save checks a version number and retries on a clash, so taps and upgrades sent at the same moment are never lost.
- **Time-based progress** (energy refill, passive production, population growth, building timers, coin income) is computed from timestamps — nothing needs to run in the background.
- **Taps** are applied instantly on screen and sent to the server in small batches. The server caps them by energy, warehouse space and a human tapping speed.
- **Referrals:** each player gets an invite link `https://t.me/<bot>/<app>?startapp=<code>`. When a new player opens it, both get coins (more if the friend has Telegram Premium) and the inviter gets population.
- **Quests:** the Telegram quest checks real channel membership via the Bot API when `TELEGRAM_CHANNEL_ID` is set and the bot is an admin there. YouTube and X can't be verified by any bot, so they unlock after the player opens the link and waits a few seconds.

### API

All routes need the `Authorization` header and return `{ serverTime, me, state }` unless noted.

| Method | Route | Body |
| --- | --- | --- |
| GET | `/api/me` | — signs in, creating the player on first visit |
| POST | `/api/tap` | `{ resource: "iron" \| "wood" \| "clay" \| "crop", taps }` |
| POST | `/api/skills/upgrade` | `{ skill: "tap" \| "energy" }` |
| POST | `/api/skills/full-energy` | — |
| POST | `/api/buildings/upgrade` | `{ building: "iron-mine" }` (ids in `config.ts`) |
| POST | `/api/quests/start` | `{ quest: "telegram" \| "youtube" \| "x" }` |
| POST | `/api/quests/claim` | `{ quest }` |
| GET | `/api/friends` | — returns `{ total, friends[] }` |

Errors come back as `{ error, code }` with status 400 (game rule) or 401 (sign-in).

## Run it locally

```bash
bun install
```

Create `.env.local` to play in a normal browser with a test player:

```bash
NEXT_PUBLIC_DEV_LOGIN=true
NEXT_PUBLIC_BOT_ADDRESS=YourBot
NEXT_PUBLIC_TELEGRAM_CHANNEL=yourchannel
NEXT_PUBLIC_YOUTUBE_CHANNEL=yourchannel
NEXT_PUBLIC_TWITTER_CHANNEL=yourhandle
```

```bash
bun dev        # http://localhost:3000
bun run test   # engine + auth tests
```

Add `?dev_user=2` to the URL to play as a different test player, and `?startapp=<referral code>` to test invites.

## Go live on Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather), then `/newapp` to create the Mini App. Its short name goes in `NEXT_PUBLIC_APP_SHORT_NAME`.
2. Create the database (Vercel and other serverless hosts):
   - Sign up at [turso.tech](https://turso.tech) (free plan is enough to start) and create a database. Pick a region close to your Vercel functions.
   - Copy its URL (`libsql://…`) and create a token for it.
   - The tables are created automatically on the first request.
3. In Vercel → Project → Settings → Environment Variables, add:
   - `TELEGRAM_BOT_TOKEN`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
   - `NEXT_PUBLIC_BOT_ADDRESS`, `NEXT_PUBLIC_APP_SHORT_NAME`, and the quest links (`NEXT_PUBLIC_TELEGRAM_CHANNEL`, …)
   - Never set `NEXT_PUBLIC_DEV_LOGIN` in production.
   Redeploy after adding them (`NEXT_PUBLIC_*` values are baked in at build time).
4. Point the Mini App URL in BotFather at your Vercel domain.

Node.js 24 is required (pinned in `package.json`).

### Hosting on your own server instead

Leave the Turso variables empty and the game uses a local SQLite file at `DATABASE_PATH`, which needs a persistent disk. With Docker:

```bash
docker build -t valorians \
  --build-arg NEXT_PUBLIC_BOT_ADDRESS=YourBot \
  --build-arg NEXT_PUBLIC_APP_SHORT_NAME=start \
  --build-arg NEXT_PUBLIC_TELEGRAM_CHANNEL=yourchannel .
docker run -p 3000:3000 -v valorians-data:/data -e TELEGRAM_BOT_TOKEN=... valorians
```

Back up `/data/valorians.db` regularly.

## Tuning the game

All balance numbers live in `src/lib/game/config.ts`: starting resources, production per hour, tap power and energy curves, building costs and times, quest rewards, referral bonuses. The server and client both read it, so a change there applies everywhere.

The Battle tab is a "coming soon" screen; military buildings already level up and add population so they'll matter once battles exist.
