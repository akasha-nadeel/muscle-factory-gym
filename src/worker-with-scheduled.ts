// Wraps the OpenNext-generated worker with a `scheduled()` handler so we
// can use CF Workers cron triggers. `fetch` is a pass-through to OpenNext.
// We re-export OpenNext's durable objects so wrangler's `main` swap is
// a drop-in replacement.

// @ts-expect-error: resolved at build time after `npm run cf:build`
import openNextWorker from "../.open-next/worker.js";
// @ts-expect-error: same
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";

type Env = {
  CRON_SECRET?: string;
  WORKER_HOSTNAME?: string;
};

type ScheduledEvent = { cron: string };

type ExecutionContext = {
  waitUntil: (p: Promise<unknown>) => void;
};

/**
 * Mapping from cron expression (as it appears in wrangler.jsonc) to the
 * URL path of the bearer-guarded endpoint we should invoke. Keep these
 * in lock-step with wrangler.jsonc `triggers.crons`.
 */
const ROUTES: Record<string, string> = {
  "30 18 * * *": "/api/cron/expire-memberships",
  "0 19 * * *": "/api/cron/inactivate-stale-members",
  "0 * * * *": "/api/cron/reconcile-payhere",
};

export default {
  fetch: openNextWorker.fetch,

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const path = ROUTES[event.cron];
    if (!path) {
      console.warn(`[scheduled] no route for cron "${event.cron}"`);
      return;
    }
    const cronSecret = env.CRON_SECRET;
    const host = env.WORKER_HOSTNAME;
    if (!cronSecret || !host) {
      console.warn(
        `[scheduled] missing env (CRON_SECRET or WORKER_HOSTNAME) for "${event.cron}"`,
      );
      return;
    }
    const url = `https://${host}${path}`;
    ctx.waitUntil(
      fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${cronSecret}` },
      })
        .then(async (r) => {
          if (!r.ok) {
            console.warn(
              `[scheduled] ${event.cron} → ${url} returned ${r.status}`,
            );
          }
        })
        .catch((err) => {
          console.warn(
            `[scheduled] ${event.cron} → ${url} fetch failed: ${err}`,
          );
        }),
    );
  },
};
