import { notFound } from 'next/navigation';
import { getBusiness, getRevenueSnapshot, getStripeAccountId } from '@/lib/business';
import { isStripeTestMode } from '@/lib/stripe';
import BondPanel from './BondPanel';
import StripeTransactionsPanel from './StripeTransactionsPanel';

function formatMicrosUSD(micros: bigint): string {
  return (Number(micros) / 1_000_000).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default async function BusinessPage({ params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) notFound();

  const stripeAccountId = getStripeAccountId(issuerId);
  const testMode = isStripeTestMode();

  // getRevenueSnapshot syncs from Stripe first when connected — a real API
  // failure (e.g. platform credentials not configured yet) must surface as
  // a visible error, never fall back to a stale/fabricated number.
  let revenue: Awaited<ReturnType<typeof getRevenueSnapshot>> | null = null;
  let revenueError: string | null = null;
  try {
    revenue = await getRevenueSnapshot(issuerId);
  } catch (err) {
    revenueError = (err as Error).message;
  }

  return (
    <main>
      <div className="fade-up" style={{ ['--stagger' as string]: 0 }}>
        <h1>{business.name}</h1>
        <p>Issuer ID: {business.issuerId}</p>

        {business.isDemo && <span className="badge">Synthetic demo data — not a real business</span>}
      </div>

      <section className="fade-up" style={{ ['--stagger' as string]: 1 }}>
        <h2>Revenue source</h2>
        {stripeAccountId ? (
          <>
            <p>
              <span className="badge-success">✓ Stripe Connected</span>{' '}
              {testMode && <span className="badge">TEST MODE</span>}
            </p>
            <p>
              Connected to Stripe account {stripeAccountId}. Revenue below is pulled live from Stripe — not manually
              entered.
            </p>
            {testMode && (
              <p className="stat-label">
                Data Source: <strong>Stripe Test Mode — synthetic/test transactions</strong>
              </p>
            )}
          </>
        ) : (
          <>
            <p>No payment processor connected yet.</p>
            <a className="button-link" href={`/api/business/${issuerId}/stripe/authorize`}>
              Connect Stripe
            </a>
          </>
        )}
      </section>

      <section className="fade-up" style={{ ['--stagger' as string]: 2 }}>
        <h2>Trailing 90-day revenue</h2>
        {revenueError ? (
          <p role="alert">Could not load live revenue: {revenueError}</p>
        ) : (
          revenue && (
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <p className="stat-label">Revenue</p>
                <p className="stat">{formatMicrosUSD(revenue.trailing90dTotalUSD)}</p>
              </div>
              <div>
                <p className="stat-label">Volatility</p>
                <p className="stat">{revenue.volatilityScore} / 100</p>
              </div>
              <div>
                <p className="stat-label">History</p>
                <p className="stat">{revenue.historyDays}d</p>
              </div>
            </div>
          )
        )}
      </section>

      {stripeAccountId && <StripeTransactionsPanel issuerId={issuerId} canGenerate={testMode} />}

      <BondPanel issuerId={issuerId} />
    </main>
  );
}
