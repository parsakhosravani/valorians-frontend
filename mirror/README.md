# Valorians on Telegram Serverless (mirror)

A second copy of the game that runs entirely on
[Telegram Serverless](https://core.telegram.org/bots/serverless): the bot, the
backend and the Mini App, with Telegram's built-in database. The Vercel app is
untouched and keeps running as before.

**It is built from the same source.** There is no second codebase to keep in
sync: `build.ts` bundles `src/server` and every `src/app/api` route into one
plain-JS module, and builds the Mini App from `src/` as a static site. A change
merged into the app reaches the mirror on the next `npm run deploy` here.

## How it fits

```
Mini App (static, app<id>.tgcloud.ai)                Telegram Serverless
src/ as a Next.js static export   ──Serverless.call('api', {path, body})──►  tgcloud/endpoints/api.js
  apiRequest() swapped at build time                                             │
                                                                                 ▼
Bot updates ─────────────────────────────────────────────────────────►  tgcloud/handlers/*.js
                                                                                 │
                                         tgcloud/lib/valorians.js  ◄─────────────┘
                                         = src/server + src/app/api/**/route.ts, bundled
                                           with mirror/shims/* in place of Node/Next:
                                           next/server, @libsql/client → SDK db,
                                           crypto, auth (platform verifies init data),
                                           fetch to api.telegram.org → SDK api
```

| On Vercel | In the mirror |
| --- | --- |
| `/api/<path>` routes | the one endpoint `api` with `{ path, method, query, body }` → same route code |
| `Authorization: tma <initData>` checked in `auth.ts` | the platform checks init data; `shims/auth.ts` trusts `ctx.initData` |
| Turso via `@libsql/client` | Serverless SQLite via `shims/libsql.ts`; tables still created by `src/server/db.ts` |
| `/api/bot` webhook | `handlers/message.js`, `callback_query.js`, `pre_checkout_query.js` |
| `/api/cron/battles` every 5 min (GitHub Action) | runs at most once a minute on players' requests (`entry.ts`); `endpoints/cron` on demand |
| `/api/bot/setup` | `endpoints/setup` (admins only) |
| `/api/avatar/<id>` | none: avatars show the default picture |

## Setting it up (once)

1. **Make a new bot** in @BotFather for the mirror (e.g. `@valorians_test_bot`).
   **Don't turn on Serverless for @valorians_bot**: the platform takes over the
   bot's webhook, and the live game on Vercel would stop getting bot updates.
2. In @BotFather, open the new bot → **Serverless** → enable it.
3. From the repo root: `bun install`, then `cd mirror && npm install`.
4. `cp .env.mirror.example .env.mirror` and fill in `NEXT_PUBLIC_BOT_ADDRESS`
   and `BOT_ADMIN_IDS` (`APP_URL` comes in step 7).
5. `npx tgcloud init` (keeps the files already here; creates `.tgcloud/`), then
   `npx tgcloud login` with the CLI token from @BotFather.
6. `npm run deploy` — builds both parts and pushes. It prints the Mini App URL.
7. Put that URL in `.env.mirror` as `APP_URL`, then `npm run deploy` again
   (the bot's "Open game" buttons use it).
8. Set the bot's texts, commands and Play button:
   `npx tgcloud run endpoints/setup '{}' --ctx '{ initData: { user: { id: <your id> } } }'`
9. Open the bot and play. The database starts empty; the first request creates
   the tables.

`npx tgcloud migrate` will list the game's tables as *undocumented* (they are
created by `db.ts`, not `tgcloud/schema.js`). That's expected; never let it drop them.

## Deploying from GitHub (no computer needed)

The **Deploy mirror** action (`.github/workflows/mirror-deploy.yml`) does steps 3–7
on GitHub's servers. Add two repository secrets, then run it from the Actions tab:

- `TGCLOUD_TOKEN`: the CLI access token from @BotFather (mirror bot → Serverless).
- `MIRROR_ENV`: what you'd put in `.env.mirror`, including a fixed `MIRROR_SECRET=` line.

The run log prints the Mini App URL. Add it to `MIRROR_ENV` as `APP_URL` and run it once more.

## Day to day

```bash
cd mirror
npm run deploy          # rebuild from src/ and push
bun test/smoke.ts       # backend against a fake SDK (after `bun build.ts backend`)
npx tgcloud status      # what's deployed vs local
```

## Known differences

- **Battles for offline players** resolve on the next request from anyone (at
  most a minute late) instead of every 5 minutes by schedule. With nobody
  playing, nothing resolves until someone opens the game. A battle you sent
  always resolves when you open the game.
- **`db.batch`** runs statements one by one, not as a transaction (the SDK has no
  transactions). Saves are still protected by the optimistic version check.
- **Avatars** use the default picture.
- **Release announcements** are off unless `RELEASE_ANNOUNCE` is set; they also
  need the Vercel git variables to know what was released, so leave them off.
- **No dev login**: the mirror only works inside Telegram.
- Separate database: players start fresh in the mirror.
