import { NextRequest, NextResponse } from 'next/server';
import { getBusiness } from '@/lib/business';
import { getLatestBond } from '@/lib/bonds';
import { computeBondId, placeMarketOrder } from '@/lib/secondary-market';

/// Places a real ask (or bid) for this business's issued bond, signed by
/// Tally's own custodian — the real on-chain account of record for every
/// bond this platform issues.
export async function POST(req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  const bond = getLatestBond(issuerId);
  if (!bond || bond.status !== 'issued' || !bond.evmDiamondAddress || !bond.bondTokenId) {
    return NextResponse.json({ error: `business ${issuerId} has no issued bond to list` }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const priceUSD = typeof body?.priceUSD === 'string' ? body.priceUSD : null;
  const isBid = Boolean(body?.isBid);
  if (!priceUSD) {
    return NextResponse.json({ error: 'priceUSD (6-decimal fixed-point string) is required' }, { status: 400 });
  }

  try {
    const bondId = computeBondId(bond.evmDiamondAddress, bond.bondTokenId);
    const result = await placeMarketOrder({
      bondId,
      bondToken: bond.evmDiamondAddress,
      priceUSD,
      quantity: '1', // bonds are issued as a single unit (numberOfUnits: '1') — see ats-client's issue.ts
      isBid,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
