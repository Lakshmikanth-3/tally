import { NextRequest, NextResponse } from 'next/server';
import { parseUsdToMicros } from '@tally/seam';
import { getBusiness, getRevenueSnapshot, listBusinessTransactions, ProcessorConnectedError, submitTransaction } from '@/lib/business';

/// Lists a business's real recorded transactions for the "View Stripe
/// Transactions" table — syncs from Stripe first (both real charges and
/// any real test-mode invoices), same as the revenue endpoint, so this is
/// never a stale local cache.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  try {
    await getRevenueSnapshot(issuerId); // triggers the real Stripe sync as a side effect
    return NextResponse.json({ transactions: listBusinessTransactions(issuerId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.amountUSD !== 'string') {
    return NextResponse.json({ error: 'amountUSD (decimal dollar string, e.g. "42.50") is required' }, { status: 400 });
  }

  const timestampSeconds = typeof body?.timestampSeconds === 'number' ? body.timestampSeconds : Math.floor(Date.now() / 1000);

  try {
    const amountUSD = parseUsdToMicros(body.amountUSD);
    submitTransaction(issuerId, amountUSD, timestampSeconds);
    return NextResponse.json({ issuerId, amountUSD: amountUSD.toString(), timestampSeconds }, { status: 201 });
  } catch (err) {
    if (err instanceof ProcessorConnectedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
