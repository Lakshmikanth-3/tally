import { notFound } from 'next/navigation';
import { getBusiness, getRevenueSnapshot, getStripeAccountId } from '@/lib/business';

function formatMicrosUSD(micros: bigint): string {
  return (Number(micros) / 1_000_000).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default async function BusinessPage({ params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) notFound();

  const stripeAccountId = getStripeAccountId(issuerId);

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
      <h1>{business.name}</h1>
      <p>Issuer ID: {business.issuerId}</p>

      <section>
        <h2>Revenue source</h2>
        {stripeAccountId ? (
          <p>Connected to Stripe account {stripeAccountId}. Revenue below is pulled live from Stripe — not manually entered.</p>
        ) : (
          <>
            <p>No payment processor connected yet.</p>
            <a href={`/api/business/${issuerId}/stripe/authorize`}>Connect Stripe</a>
          </>
        )}
      </section>

      <section>
        <h2>Trailing 90-day revenue</h2>
        {revenueError ? (
          <p role="alert">Could not load live revenue: {revenueError}</p>
        ) : (
          revenue && (
            <>
              <p>{formatMicrosUSD(revenue.trailing90dTotalUSD)}</p>
              <p>Volatility score: {revenue.volatilityScore} / 100</p>
              <p>History: {revenue.historyDays} days</p>
            </>
          )
        )}
      </section>
    </main>
  );
}
