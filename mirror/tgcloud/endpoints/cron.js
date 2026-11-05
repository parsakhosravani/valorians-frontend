// POST /api/cron — the battle/trade/announcement sweep, on demand.
// It also runs by itself at most once a minute on players' requests (entry.ts),
// since Serverless has no scheduler. Only fights what is already due, so any
// signed-in caller may trigger it.
import { runCron } from '../lib/valorians.js';

export default async function () {
  return runCron();
}
