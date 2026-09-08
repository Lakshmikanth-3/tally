// One-off setup script — NOT a product feature, not exposed via any route
// or UI action. Run manually (`npx tsx scripts/seed-demo-business.ts`) to
// seed a single, explicitly-marked demo business with clearly-disclosed
// synthetic revenue, for demoing the underwriting → bond-issuance flow
// without a real business's real numbers. See README.md's "Demo data
// disclosure" section — every place this business's revenue is shown in
// the product surfaces the same disclosure.
import { parseUsdToMicros } from '@tally/seam';
import { getDb } from '../lib/db';
import { markBusinessAsDemo, seedDemoTransactions } from '../lib/business';

const ISSUER_ID = 'issuer-corrados-deli-f5bb20';
const DAYS_OF_HISTORY = 95;
const BASE_DAILY_USD = 165;
const VARIANCE_USD = 18; // deterministic, small — keeps volatilityScore low

function main() {
  const db = getDb();
  const business = db.prepare('SELECT issuer_id FROM businesses WHERE issuer_id = ?').get(ISSUER_ID);
  if (!business) {
    throw new Error(`business ${ISSUER_ID} not found — register it first via POST /api/business/register`);
  }

  // Clear any prior transactions for this business (earlier ad-hoc manual
  // test entries from development) so the seeded history is coherent.
  db.prepare('DELETE FROM transactions WHERE issuer_id = ?').run(ISSUER_ID);

  markBusinessAsDemo(ISSUER_ID);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const transactions: { amountUSD: bigint; timestampSeconds: number }[] = [];

  for (let daysAgo = DAYS_OF_HISTORY; daysAgo >= 1; daysAgo--) {
    // Deterministic smooth variation, not random — reproducible and clearly
    // synthetic (a real shop's day-to-day revenue is never this regular).
    const dollars = BASE_DAILY_USD + VARIANCE_USD * Math.sin(daysAgo / 3);
    const amountUSD = parseUsdToMicros(dollars.toFixed(2));
    const timestampSeconds = nowSeconds - daysAgo * 86_400;
    transactions.push({ amountUSD, timestampSeconds });
  }

  seedDemoTransactions(ISSUER_ID, transactions);

  const totalUSD = transactions.reduce((sum, t) => sum + t.amountUSD, 0n);
  console.log(`Seeded ${transactions.length} synthetic-demo transactions for ${ISSUER_ID}`);
  console.log(`Total across full history: $${(Number(totalUSD) / 1_000_000).toFixed(2)}`);
  console.log(`Earliest transaction: ${new Date((nowSeconds - DAYS_OF_HISTORY * 86_400) * 1000).toISOString()}`);
}

main();
