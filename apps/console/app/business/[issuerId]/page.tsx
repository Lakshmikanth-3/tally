import { notFound } from 'next/navigation';
import { getBusiness, getRevenueSnapshot, getStripeAccountId } from '@/lib/business';
import { getStripeAccountCountry, isStripeTestMode } from '@/lib/stripe';
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
  const accountCountry = stripeAccountId ? await getStripeAccountCountry(stripeAccountId) : null;
  // Stripe blocks USD invoice payment on India-domiciled accounts under a
  // real RBI export rule, which is exactly what the test-mode revenue
  // generator needs — see lib/stripe.ts.
  const canGenerateTestData = testMode && accountCountry !== null && accountCountry !== 'IN';

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
      <div className="fade-up" style={{ ['--stagger' as string]: 0, paddingTop: 40 }}>
        <h1>{business.name}</h1>
        <p className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          {business.issuerId}
        </p>

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
            <p className="mono" style={{ fontSize: '0.8rem' }}>
              {stripeAccountId}
              {accountCountry && ` · ${accountCountry}`}
            </p>
            <p>Revenue below is pulled live from Stripe — not manually entered.</p>
            {testMode && (
              <p className="stat-label">
                Data Source: <strong>Stripe Test Mode — synthetic/test transactions</strong>
              </p>
            )}
            {testMode && accountCountry === 'IN' && (
              <div role="alert" style={{ marginTop: 14 }}>
                This connected account is India-domiciled. Stripe enforces a real RBI export-compliance rule that
                rejects USD invoice payment on it, which is what test-mode revenue generation needs — so the generator
                below will fail on this account. Reconnect with a US test account to use it.
                <div style={{ marginTop: 12 }}>
                  <a className="button-link secondary" href={`/api/business/${issuerId}/stripe/authorize`}>
                    Reconnect Stripe (US test account)
                  </a>
                </div>
              </div>
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
            <div style={{ display: 'flex', gap: 44, flexWrap: 'wrap' }}>
              <div>
                <p className="stat-label">90-day revenue</p>
                <p className="stat">{formatMicrosUSD(revenue.trailing90dTotalUSD)}</p>
              </div>
              <div>
                <p className="stat-label">Volatility</p>
                <p className="stat">{revenue.volatilityScore}/100</p>
              </div>
              <div>
                <p className="stat-label">History</p>
                <p className="stat">{revenue.historyDays}d</p>
              </div>
            </div>
          )
        )}
      </section>

      {stripeAccountId && <StripeTransactionsPanel issuerId={issuerId} canGenerate={canGenerateTestData} />}

      <BondPanel issuerId={issuerId} />
    </main>
  );
}
