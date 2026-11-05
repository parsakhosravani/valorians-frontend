// POST /api/api — every request the Mini App makes: { path, method, query, body }.
// Runs the same route code as the Vercel app's /api/<path> (see mirror/entry.ts).
import { callRoute } from '../lib/valorians.js';

export default async function (input, ctx) {
  // ctx.initData is verified by the platform before we get here.
  return callRoute(input, ctx.initData);
}
