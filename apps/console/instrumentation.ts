/// Next.js's real server-startup hook (https://nextjs.org/docs/app/guides/instrumentation)
/// — runs once when the server process starts, in both `next dev` and
/// `next start`. This is what actually turns on the periodic lifecycle
/// sweep (arm coupons, anchor executed ones, redeem matured bonds); without
/// it, packages/scheduler's settlement functions exist but nothing ever
/// calls them.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startLifecyclePoller } = await import('./lib/lifecycle-poller');
    startLifecyclePoller();
  }
}
