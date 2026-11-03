# Valorians 2 (Nov 2026)

The second version of the game's rules: a full balance pass, a late game, and the guardrails
that keep it from breaking. Art and screens are the existing ones; nothing was wiped.
Design decisions behind each change are in `GAME_DESIGN.md`; this file is the release map.

## For players

### Buildings
- Every building has a **top level** (20 for most; Barracks and Siege Workshop 5; Stable,
  Dragon Roost and Academy 10; Exploration Center 1). Levels above the top were refunded, up to
  a full warehouse.
- **No building above the Town Hall** (mines and the Warehouse may lead by 2). The Town Hall gives a
  builder at 10 and 20 (max 3, +1 with Plus) and up to 50% faster building.
- **New upgrade curve:** level 1 takes 40 s; levels 1–15 are gentle, 16–20 are the late game.
- **Bonuses have tops:** Arsenal/Armory +40%, City Gate +60%, Military Command, War Hall and Hospital
  50%, Trapmaker 25%. Treasury and Watchtower grow every level.
- **Unlock tree:** buildings open step by step (Stable: Barracks 3 + Town Hall 5; Dragon Roost:
  Town Hall 20, Stable 10, Siege Workshop 5…).
- **Mastery stars:** a building at its top earns up to 5 stars, each half a level of effect.
- **Cancel** any build (full refund in the first minute, 80% after) and **finish the last 5
  minutes free** (15 with Plus).

### Troops and war
- **Every troop has one job:** Spearman (cheap defense, vs horse), Archer (vs foot and dragon),
  Swordsman (all-rounder), Axeman (attack per crop), Light Cavalry (fast raider), Paladin
  (defense per crop), Knight (attack per resource).
- **Soldiers are recruited from your people** (1 per crop they eat). The population shown and
  ranked counts people at home and soldiers.
- **Siege breaks levels:** 10 rams per City Gate level, 8 catapults per Watchtower level.
- **Attacks on players take at least 5 minutes**, so the warning arrives in time.
- **Ranks come slowly:** Legend around camps 25–30. Militia stops at 2,000.

### Economy
- **Daily Mine** is a boost again (it was 5× a top village's output when maxed).
- **Camps** come back every 6 hours; a repeat pays at most 2 hours of your production.
- **Merchants** carry ~100k at Trading Post 20. **Merchant of the North:** swap resources
  at once at 60%.

### Late game
- **Outposts:** at Town Hall 10, 15 and 20, found a new place on the map with its own four
  fields and builder, feeding home. You choose the land; it gives up to +40% to one resource.
- **Seasons and the World Wonder:** clans race to finish a 20-level Wonder; the winners get
  100,000 coins each and a crown, then every Wonder falls and a new season starts.

### Clans and ranking
- Clan perks stop at tech 15 (+45% production, +30% attack, +30% defense); clan levels go on.
- **Aid limits:** new members get aid after 3 days; at most a day of their own output per day.
- **The leaderboard ranks by power** (population and victories still have tabs).

## For developers

| What | Where |
| --- | --- |
| Building tops, curves, unlock tree, Mastery, queue controls | `config.ts` (`BUILDINGS`, `BUILDING_REQUIRES`, `MASTERY`, `CANCEL_*`, `FREE_FINISH_*`), `engine.ts` |
| Troop roles, siege, militia, XP, recruitment | `config.ts` (`UNITS`, `MILITIA_MAX`, `XP_*`, `unitPeople`), `war.ts` |
| Outposts | `config.ts` (`OUTPOST`), `engine.ts` (`foundOutpost`, `upgradeField`, `outpostOutput`), `outpost.ts` (land bonus, offered spots), `server/outposts.ts`, `api/outposts/spots`, `organisms/tribe/Outposts.tsx` |
| Seasons / World Wonder | `config.ts` (`WONDER`), `clan.ts` (`wonderCost`, `wonderBlocked`), `server/clans.ts` (`raiseWonder`, `seasonView`) |
| Merchant of the North | `config.ts` (`EXCHANGE_RATE`), `trade.ts` (`exchange`), `Market.tsx` (`ExchangeCard`) |
| Clan aid limits | `config.ts` (`CLAN.aid*`), `clan.ts` (`aidRoom`, `aidTooSoon`), `server/clans.ts` (`sendAid`) |
| Power leaderboard | `server/ranks.ts`, `server/players.ts` (`rankOf`), `Leaderboard.tsx` |

**DB:** `SCHEMA_VERSION` 6 → 9 (7: `clan_log_target` index, 8: `seasons` + `clans.wonder_*`,
9: `outposts`). All additive: `CREATE … IF NOT EXISTS` and `ALTER … ADD COLUMN`.

**Saves:** old saves load through `normalizeState` (+ `capBuildingLevels`, idempotent).
New state fields: `mastery`, `outposts`, `seasonWins`.

**Tests:**
- Unit (rules): `src/lib/game/*.test.ts`, incl. `physics.test.ts` (laws: time, conservation, bounds,
  junk input, 6,000-action chaos) and `balance.test.ts` (pacing sims). Both must pass (CLAUDE.md rule 11).
- Integration (server + DB): `src/server/*.server.test.ts`, incl. `routes.server.test.ts` (every
  Valorians 2 API route, refusals as 400 `{ error, code }`, health, maintenance, launcher links).
- End to end (Chromium, real screens): `e2e/`, run with `bun run e2e` (CI job `e2e`): every screen
  opens; core journeys (daily reward, Daily Mine, first build, training, Plus trial, clan found/join/
  donate, market post/buy); Valorians 2 features (Mastery, outposts, merchant, people, World Wonder);
  the one error page (lost link, offline) and the launcher (up, down/paused, maintenance, no open redirect).

**When the game is down:** one error page for every failure, a maintenance switch
(`MAINTENANCE=on`) and a launcher outside the host for outages and failed builds. See
`docs/ARCHITECTURE.md`, "When the game is down".

**Bugs fixed on the way:** troops finishing training while away ate no crop; ids like
`__proto__` crashed routes; flaky raid tests (targets across the sea).
