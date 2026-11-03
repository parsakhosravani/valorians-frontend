# Valorians Legend — guide for Claude

A Telegram Mini App strategy game (Next.js 16, React 19, TypeScript, Tailwind 3, bun).
This one repo is the whole game: the UI **and** the backend (API routes + SQLite/Turso).
Players grow a tribe, build, train troops, raid players and barbarian camps, join clans, trade.

Read this file first. For depth, read only what the task needs:
- `docs/ARCHITECTURE.md` — how a request flows, how state is saved, battles, bot, payments.
- `docs/GAME_DESIGN.md` — the owner's design decisions. **Follow them; don't "fix" them.**

## Commands

```bash
bun install
bun dev              # http://localhost:3000 (needs NEXT_PUBLIC_DEV_LOGIN=true in .env.local)
bun run check        # typecheck + lint + test — run before saying a task is done
bun run test         # bun:test, tests sit next to the code (*.test.ts)
bun run build        # CI runs this too
```

Add `?dev_user=2` to the URL to play as another test player.

## Golden rules

1. **The server is authoritative.** Every game rule is checked on the server. The client only
   predicts between syncs. Never trust numbers sent by the client; cap them like `applyTaps` does.
2. **Game rules are pure functions in `src/lib/game/`.** No database, no `fetch`, no `Date.now()`
   inside — `now` is always passed in. Shared by server and client. Rule broken → `throw new GameError(...)`.
3. **All balance numbers live in `src/lib/game/config.ts`.** Never hard-code a cost, rate or reward
   in a component or route. Comment *why* a number is what it is (the file already does this).
4. **State changes go through `action()` / `mutatePlayer()`** (`src/server/http.ts`, `src/server/players.ts`).
   They bring state up to `now` with `advance()` and save with optimistic locking (retry on clash).
5. **Time-based progress is computed from timestamps** (`advance()`), never by a background loop.
   The only scheduled work is the `/api/cron/battles` sweep (GitHub Action every 5 min).
6. **Changing `GameState`** (engine.ts): add the default in `createInitialState` **and** merge it in
   `normalizeState` so old saves still load. Removing a field: drop it in `normalizeState`.
7. **Changing the DB schema** (`src/server/db.ts`): use `CREATE … IF NOT EXISTS` / safe `ALTER`s and
   **bump `SCHEMA_VERSION`**, or existing databases skip the migration.
8. **PR titles are shown to players.** Each production deploy auto-announces the merged PR titles
   through the bot. Write titles as short player news ("Barbarian camps now have names"),
   not dev notes ("refactor camp utils").
9. **Secrets:** `.env` is committed defaults only. Real values go in `.env.local` or the host.
   Never commit a bot token. Never set `NEXT_PUBLIC_DEV_LOGIN` in production.
10. Add or update a test in `src/lib/game/*.test.ts` for every rule or balance change.

## Where things are

| What | Where |
| --- | --- |
| Balance numbers, buildings (`BUILDINGS`), units (`UNITS`), camps, Plus, shields | `src/lib/game/config.ts` |
| Core engine: `GameState`, `advance`, rates, building/skill/quest actions | `src/lib/game/engine.ts` |
| War rules: training, attack/defense, loot, camps, gate damage, XP/ranks | `src/lib/game/war.ts` |
| World map, terrain, routes, sea | `src/lib/game/map.ts` |
| Other pure rules | `battle.ts`, `bandits.ts`, `trade.ts`, `clan.ts`, `advice.ts`, `island.ts` in `src/lib/game/` |
| Route wrapper (auth, errors, battle sweep) | `src/server/http.ts` |
| DB + tables + `SCHEMA_VERSION` | `src/server/db.ts` |
| Load/save players, `playerView` (what the client receives) | `src/server/players.ts` |
| Server side of war, clans, trade, bandits, map | `src/server/war.ts`, `clans.ts`, `trade.ts`, `bandits.ts`, `map.ts` |
| Telegram bot, announcements, notifications, payments | `src/server/bot.ts`, `announce.ts`, `notify.ts`, `plus.ts` |
| API routes | `src/app/api/**/route.ts` |
| Client fetch + sign-in header | `src/lib/api.ts` |
| Client game state, live counters, tap batching | `src/context/resource/ResourceContext.tsx` (`useGame()`) |
| Pages (thin) → screens | `src/app/(routes)/*/page.tsx` → `src/components/templates/*.tsx` |
| War map (canvas, camera, web worker) | `src/components/organisms/war/` |
| Art | `public/images/` (buildings, troops, walls, emblems, …) as `.webp` |

### Screen names vs routes (they differ)

| Player sees (navbar) | Route | Template |
| --- | --- | --- |
| Hall | `/hall` | `Hall.tsx` |
| Build | `/tribe` | `Tribe.tsx` |
| War (map, army, reports) | `/battle` | `Battle.tsx` |
| Clan | `/clan` | `Clan.tsx` |
| Mine (Daily Mine) | `/resources` | `Resources.tsx` |
| Market, Leaderboard, Quest | `/market`, `/leaderboard`, `/quest` | same names |

"Tribe" and "village" both mean the player's home.

## Recipes

**New game action (API route)** — write the pure function in `src/lib/game/`, test it, then:
```ts
// src/app/api/<area>/<verb>/route.ts
import { action } from "@/server/http";
import { doThing } from "@/lib/game/engine";
export const POST = action((s, { body, now }) => doThing(s, String(body.thing), now));
```
Routes that need custom output use `handler(...)` instead. Errors become `{ error, code }` (400/401).
Then call it from the client through `src/lib/api.ts` / `useGame()`.

**New building** — add a `def(...)` entry to `BUILDINGS` in config.ts (id is the name in kebab-case),
add its effect to `BuildingEffect` if new and handle it in `getRates`, add the image
`public/images/buildings/<Name>.webp`. Buildings have a top (`maxLevel`, default 20) and can't pass the Town Hall (see `buildingCap`).

**New troop** — add the id to `UNIT_IDS` and a `UnitDef` to `UNITS`, image in `public/images/troops/`,
check `war.ts` (unlocks, special bonuses) and `normalizeState` (troops map is built from `UNIT_IDS`).

**Balance change** — edit config.ts only, update the tests that pin numbers, explain the reasoning
in a comment (old value → new value and why), and mention it in the PR title for players.

## Code style

- Path aliases: `@/…` = `src/…`, `~/…` = `public/…` (images are imported, e.g. `import img from "~/images/…webp"`).
- Components follow atomic design: `atoms/` → `molecules/` → `organisms/` → `templates/`.
  Screens are `"use client"`. Server files start with `import "server-only"`.
- React Compiler is on: don't add `useMemo`/`useCallback` just for speed.
- `typedRoutes` is on: links must be real routes.
- Plain `<img>` is fine for sprites. Tailwind for styling; fonts are Cinzel (titles) and Alegreya Sans.
- Comments explain *why*, in plain words. Keep the existing tone.
- Next.js 16 / React 19 are newer than much training data — check the installed version's
  behaviour (`node_modules/next`) instead of assuming older APIs.

If code and docs disagree, trust the code and update the docs you touch.
