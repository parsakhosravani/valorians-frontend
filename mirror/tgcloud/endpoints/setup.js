// POST /api/setup — sets the mirror bot's description, commands and Play
// button (the Vercel app's /api/bot/setup). Admins only (BOT_ADMIN_IDS). Run it with:
//   npx tgcloud run endpoints/setup '{}' --ctx '{ initData: { user: { id: <your id> } } }'
import { runSetup } from '../lib/valorians.js';

export default async function (_input, ctx) {
  return runSetup(ctx.initData);
}
