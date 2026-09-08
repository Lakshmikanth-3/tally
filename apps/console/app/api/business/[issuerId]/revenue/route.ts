import { NextRequest, NextResponse } from 'next/server';
import { getBusiness, getRevenueSnapshot } from '@/lib/business';

/// Read by the Chainlink CRE confidential workflow, from inside the TEE,
/// via HTTPClient.sendRequest(teeRuntime, ...) with a bearer secret fetched
/// with runtime.getSecret() — never by the browser or an unauthenticated
/// caller. Returns raw revenue facts only; the underwriting policy
/// (thresholds, discount rate) is applied inside the enclave, not here.
export async function GET(req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const expectedToken = process.env.REVENUE_API_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: 'server misconfigured: REVENUE_API_TOKEN is not set' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const presentedToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (presentedToken !== expectedToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  try {
    const snapshot = await getRevenueSnapshot(issuerId);
    return NextResponse.json({
      issuerId: snapshot.issuerId,
      trailing90dTotalUSD: snapshot.trailing90dTotalUSD.toString(),
      volatilityScore: snapshot.volatilityScore,
      historyDays: snapshot.historyDays,
    });
  } catch (err) {
    // Surfaces honestly (e.g. a live Stripe pull failing) rather than the
    // CRE workflow silently getting a stale or fabricated snapshot.
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
