# Valorians Legend

A Telegram Mini App strategy game: grow your tribe, build 24 buildings, train an army, raid other players and barbarian camps, and climb the leaderboard. A short Daily Mine (tapping with combos, weak spots and Frenzy) gives a daily boost, and a 7-day login streak rewards coming back.

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

### Daily Mine and streak

- **Stamina** refills once a day at UTC midnight (1,500 at level 1, 10 per strike) — about two minutes of mining.
- **Weak spot:** hitting the glowing rune is worth ×3. **Combo:** tapping in rhythm (under 1.2s apart) adds +0.1 every 10 hits, up to ×2. **Frenzy:** the meter fills from strikes and weak-spot hits; when full, 8 seconds of double rewards that cost no stamina.
- The client sends batches `{ taps, crits, comboSum, frenzyTaps }`; the server caps tap speed, weak-spot share (40%), combo (×2) and only allows Frenzy once the meter really filled.
- **Streak:** claim once a UTC day for 200 → 2,000 coins over 7 days (day 7 adds 1,000 of each resource); missing a day restarts it.

### War

- **Troops:** Spearmen and Archers (Barracks), Cavalry (Stable), Battering Rams (Siege Workshop). Each has attack, defense, carry capacity, training time and a crop upkeep. Training runs as a queue (up to 5 batches); Military Command speeds it up.
- **Raids on players:** the Raid tab lists unshielded tribes close to your power. Attack power vs defense (troops at home + Watchtower + militia, boosted by Armory, Trapmaker and City Gate; rams break the gate bonus), ±10% luck. The loser's army is wiped out; the winner loses (loser/winner)^1.5 of theirs. Hospital saves part of the losses.
- **Loot:** winners carry home up to half of what the defender has above their Hideout's protected amount, limited by carry capacity. Armies take time to come home (War hall shortens it); loot arrives with them.
- **Protection:** new players get a 72h shield (attacking a player ends it), and a raided tribe gets a 2h shield.
- **Barbarian camps:** 30 levels of PvE. First win gives a big reward and unlocks the next camp; beaten camps can be raided again hourly for 30%.
- **Ranks:** each troop type is a regiment that earns XP in every battle (attacking or defending), shared by how much each type contributed; losses cost XP because veterans die too. Recruit → Soldier → Veteran → Elite → Champion → Legend, each rank +4% attack and defense. Promotions show in the battle report and the Telegram message.
- **Arsenal upgrades:** with an Arsenal, forge better gear for a troop type, one upgrade at a time, +5% attack and defense per level (up to 10). Rank sets how far you can go: level 2 as Recruits, +2 per rank. Drawn portraits can be swapped for painted ones by adding `public/images/troops/<id>.webp` and listing the id in `PAINTED_TROOPS`.
- **Reports and leaderboard:** every battle is saved for both sides; the leaderboard ranks tribes by population, power and victories (tap your rank in the header).

All numbers are in `src/lib/game/config.ts`; the rules are in `src/lib/game/war.ts` (tests in `war.test.ts`).

### API

All routes need the `Authorization` header and return `{ serverTime, me, state }` unless noted.

| Method | Route | Body |
| --- | --- | --- |
| GET | `/api/me` | — signs in, creating the player on first visit |
| POST | `/api/tap` | `{ resource, taps, crits?, comboSum?, frenzyTaps? }` |
| POST | `/api/skills/upgrade` | `{ skill: "tap" \| "energy" }` |
| POST | `/api/streak` | — claims today's streak reward |
| POST | `/api/buildings/upgrade` | `{ building: "iron-mine" }` (ids in `config.ts`) |
| POST | `/api/quests/start` | `{ quest: "telegram" \| "youtube" \| "x" }` |
| POST | `/api/quests/claim` | `{ quest }` |
| GET | `/api/friends` | — returns `{ total, friends[] }` |
| POST | `/api/war/train` | `{ unit: "spearman" \| "archer" \| "cavalry" \| "ram", count }` |
| POST | `/api/war/upgrade` | `{ unit }` — starts forging that troop type's next Arsenal upgrade |
| GET | `/api/war/targets` | — tribes you can raid now |
| POST | `/api/war/raid` | `{ target: playerId, units }` — also returns `report` |
| POST | `/api/war/camp` | `{ level, units }` — also returns `report` |
| GET | `/api/war/reports` | — your last 30 battles |
| GET | `/api/leaderboard?by=population\|power\|wins` | — top 50 and your rank |

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

**Without Turso** the game still runs on Vercel, but it can only store players in `/tmp`, which Vercel wipes whenever it restarts the server — so progress can reset. Add the two Turso variables to make it permanent; no code change needed.

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

