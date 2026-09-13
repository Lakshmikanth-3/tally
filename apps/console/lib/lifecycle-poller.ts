import { runDueLifecycleActions } from './lifecycle';
import { IS_READ_ONLY } from './db';

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes — coarse-grained on purpose: each sweep can open a real headless-browser session per bond needing redemption

let running = false;
let started = false;

async function poll(): Promise<void> {
  if (running) return; // never overlap two sweeps against the same real accounts/keys
  running = true;
  try {
    const summary = await runDueLifecycleActions();
    const did = summary.armedCoupons.length + summary.anchoredCoupons.length + summary.redeemedBonds.length;
    if (did > 0 || summary.errors.length > 0) {
      console.log('[lifecycle]', JSON.stringify(summary));
    }
  } catch (err) {
    console.error('[lifecycle] sweep failed:', (err as Error).message);
  } finally {
    running = false;
  }
}

/// Starts the real periodic sweep that arms coupons, anchors executed
/// ones, and redeems matured bonds — see lifecycle.ts. Idempotent: Next's
/// dev server can call instrumentation's register() more than once across
/// hot reloads, and this must not stack up multiple intervals against the
/// same real custodian account.
export function startLifecyclePoller(): void {
  if (started) return;
  // The hosted showcase has no custodian key and no headless browser, and
  // its database is read-only — a sweep there would launch browsers and
  // attempt real signing on every cold start, and fail on every write.
  if (IS_READ_ONLY) return;
  started = true;
  setInterval(() => void poll(), POLL_INTERVAL_MS);
  // Also run once shortly after startup, not the first time only 10
  // minutes later — a freshly-issued bond shouldn't wait a full interval
  // for its coupon to get armed.
  setTimeout(() => void poll(), 30_000);
}
