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
- **Clans:** players found a clan (costs coins, picks a name and a short tag) or join an open one, up to a member cap. The founder leads and can remove members; when the leader leaves, the longest-serving member takes over, and the last member out disbands the clan. Clans are ranked by their members' total population.
- **Quests:** the Telegram quest checks real channel membership via the Bot API when `TELEGRAM_CHANNEL_ID` is set and the bot is an admin there. YouTube and X can't be verified by any bot, so they unlock after the player opens the link and waits a few seconds.

### Daily Mine and streak

- **Stamina** refills once a day at UTC midnight (1,500 at level 1, 10 per strike) — about two minutes of mining.
- **Weak spot:** hitting the glowing rune is worth ×3. **Combo:** tapping in rhythm (under 1.2s apart) adds +0.1 every 10 hits, up to ×2. **Frenzy:** the meter fills from strikes and weak-spot hits; when full, 8 seconds of double rewards that cost no stamina.
- The client sends batches `{ taps, crits, comboSum, frenzyTaps }`; the server caps tap speed, weak-spot share (40%), combo (×2) and only allows Frenzy once the meter really filled.
- **Streak:** claim once a UTC day for 200 → 2,000 coins over 7 days (day 7 adds 1,000 of each resource); missing a day restarts it.

### War

- **Troops:** infantry from the Barracks — Spearmen (1), Swordsmen (2), Archers (3), Axemen (5); horsemen from the Stable — Light Cavalry (1), Paladins (3), Knights (10); siege from the Siege Workshop — Battering Rams (1), Catapults (5). Each has attack, defense, carry capacity, speed, training time and a crop upkeep. Horsemen fight 25% weaker in forests and Spearmen defend 50% better against them. Rams break the City Gate bonus, catapults the Watchtower. Training runs as a queue (up to 5 batches); Military Command speeds it up.
- **Raids on players:** the Raid tab lists unshielded tribes close to your power. Attack power vs defense (troops at home + Watchtower + militia, boosted by Armory, Trapmaker and City Gate; rams break the gate bonus), ±10% luck. The loser's army is wiped out; the winner loses (loser/winner)^1.5 of theirs. Hospital saves part of the losses.
- **Loot:** winners carry home up to half of what the defender has above their Hideout's protected amount, limited by carry capacity. Armies take time to come home (War hall shortens it); loot arrives with them.
- **Protection:** new players get a 72h shield (attacking a player ends it), and a raided tribe gets a 2h shield.
- **Barbarian camps:** 30 levels of PvE. First win gives a big reward and unlocks the next camp; beaten camps can be raided again hourly for 30%.
- **Ranks:** each troop type is a regiment; only the troop types that fight in a battle (attacking or defending) earn XP, shared by how much each contributed; losses cost XP because veterans die too. Recruit → Soldier → Veteran → Elite → Champion → Legend, each rank +4% attack and defense. Promotions show in the battle report and the Telegram message.
- **Reports and leaderboard:** every battle is saved for both sides; the leaderboard ranks tribes by population, power and victories (tap your rank in the header).

All numbers are in `src/lib/game/config.ts`; the rules are in `src/lib/game/war.ts` (tests in `war.test.ts`).

### Update announcements

Admins broadcast news from the bot chat. To become an admin, either put your Telegram user id in `BOT_ADMIN_IDS` (comma-separated for several admins), or set a secret `BOT_ADMIN_CODE` (16+ characters) and open `https://t.me/valorians_bot?start=admin_<code>`: the bot makes you an admin and right away sends a test announcement of the live version (with **🧪 Send to me only** to preview it safely). Then in @valorians_bot:

1. Send `/announce`.
2. Send the post: text, or a photo or video with a caption. Formatting, emoji and links are kept.
3. The bot shows a preview exactly as players will see it, with **Send to N players**, **Players + news channel** (when `TELEGRAM_CHANNEL_ID` is set and the bot can post there) and **Cancel**.

Sending runs at ~25 messages a second: a first batch right away, the rest from the cron (`/api/cron/battles`, every 5 minutes), picking up where it stopped. When it's done the bot messages you how many players got it. Each announcement carries a **Play now** button and a **Mute news** button; players can also toggle news with `/news`. Players who blocked the bot are skipped until they write to it again. Battle alerts are not affected by muting.

**After each deploy** the bot notices the new version (Vercel's `VERCEL_GIT_COMMIT_SHA`) right after the deploy finishes (GitHub runs the cron workflow on Vercel's deployment event; players opening the game and bot messages also check it) and sends every admin a ready-made draft listing the pull requests merged since the last version, with **Send**, **Players + news channel**, **Write my own** and **Cancel**. Nothing reaches players until an admin taps Send; once one admin sends it, the other admins' drafts are retired. The first time it runs, the draft covers only the version just deployed. What changed is read from the public GitHub API (`GITHUB_REPO`, default from Vercel's repo variables; set `GITHUB_TOKEN` for a private repo).

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
| GET | `/api/clan?q=` | — returns `{ mine, clans[], limits }`: your clan with members, and clans to browse |
| POST | `/api/clan/create` | `{ name, tag, description? }` — costs coins |
| POST | `/api/clan/join` | `{ id }` |
| POST | `/api/clan/leave` | — |
| POST | `/api/clan/kick` | `{ id }` — leader only |
| POST | `/api/war/train` | `{ unit, count }` (unit ids in `config.ts`) |
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

Add `?dev_user=2` to the URL to play as a different test player (handy for testing clans with several members).

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

All balance numbers live in `src/lib/game/config.ts`: starting resources, production per hour, tap power and energy curves, building costs and times, quest rewards, clan limits and founding cost. The server and client both read it, so a change there applies everywhere.

