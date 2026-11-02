// Bot update: callback_query. Same handling as the Vercel app's /api/bot webhook (src/server/bot.ts).
import { botUpdate } from '../lib/valorians.js';

export default async function (_payload, ctx) {
  await botUpdate(ctx.update);
}
