import { existsSync } from 'node:fs';

// The test runner doesn't go through Next's env loading, so DATABASE_URL and
// REVENUE_API_TOKEN have to be read from the same .env.local the app uses.
if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

/// Every business a test registers is named with this prefix, so cleanup can
/// remove exactly those rows and nothing a person created.
export const E2E_NAME_PREFIX = 'E2E Test Shop ';

/// True when the suite targets a deployed app rather than a console on this
/// machine (TALLY_E2E_BASE_URL set to a non-localhost URL). Hosted
/// deployments refuse signing routes with 501 instead of the local guard's
/// 403.
export const IS_REMOTE_TARGET = (() => {
  const url = process.env.TALLY_E2E_BASE_URL;
  if (!url) return false;
  return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/.test(url);
})();

/// Registration writes to the same real Postgres database the app uses —
/// there is no separate test database, by design (this repo doesn't mock
/// its own storage). So suites remove exactly the rows they created and
/// nothing else, rather than leaving test businesses in the dashboard.
export async function purgeE2EBusinesses(): Promise<number> {
  const { withTransaction } = await import('../lib/db');
  return withTransaction(async (tx) => {
    const rows = await tx.all<{ issuer_id: string }>('SELECT issuer_id FROM businesses WHERE name LIKE ?', `${E2E_NAME_PREFIX}%`);
    for (const row of rows) {
      await tx.run('DELETE FROM coupon_payments WHERE issuer_id = ?', row.issuer_id);
      await tx.run('DELETE FROM bonds WHERE issuer_id = ?', row.issuer_id);
      await tx.run('DELETE FROM transactions WHERE issuer_id = ?', row.issuer_id);
      await tx.run('DELETE FROM businesses WHERE issuer_id = ?', row.issuer_id);
    }
    return rows.length;
  });
}
