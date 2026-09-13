/// Next.js's real server-startup hook (https://nextjs.org/docs/app/guides/instrumentation)
/// — runs once when the server process starts, in both `next dev` and
/// `next start`. This is what actually turns on the periodic lifecycle
/// sweep (arm coupons, anchor executed ones, redeem matured bonds); without
/// it, packages/scheduler's settlement functions exist but nothing ever
/// calls them.
export async function register() {
  // Checked here, before the import, rather than only inside the poller:
  // importing it at all pulls in the headless-browser signer (playwright),
  // which isn't shipped to the hosted deployment — loading it there crashes
  // every server-rendered request with "Cannot find module 'playwright'".
  // Mirrors lib/db.ts's IS_HOSTED, inlined so this file imports nothing.
  const isHosted = process.env.TALLY_HOSTED === '1' || Boolean(process.env.VERCEL);
  if (process.env.NEXT_RUNTIME === 'nodejs' && !isHosted) {
    const { startLifecyclePoller } = await import('./lib/lifecycle-poller');
    startLifecyclePoller();
  }
}
