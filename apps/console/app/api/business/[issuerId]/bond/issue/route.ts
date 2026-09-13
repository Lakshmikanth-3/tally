import { NextRequest, NextResponse } from 'next/server';
import { requireTrustedCaller } from '@/lib/api-guard';
import { getBusiness } from '@/lib/business';
import { issueBondForBusiness } from '@/lib/bonds';

// Real issuance is a real multi-transaction on-chain flow through a real
// headless browser — comfortably over Vercel's default 10s function limit.
export const maxDuration = 60;

/// Triggers a real underwriting verdict and, if approved, a real bond
/// issuance through the real ATS Factory contract on Hedera testnet (see
/// lib/bonds.ts). This is a real multi-transaction on-chain flow driven
/// through a real headless-browser signer — expect ~15-30 real seconds,
/// not an instant response.
export async function POST(req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const refusal = requireTrustedCaller(req);
  if (refusal) return refusal;

  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  // Both optional — omitting them issues this platform's standard 90-day,
  // single-bullet-coupon bond, which is what the UI does today.
  const body = await req.json().catch(() => ({}));
  const termSeconds = typeof body?.termSeconds === 'number' ? body.termSeconds : undefined;
  const numberOfCoupons = typeof body?.numberOfCoupons === 'number' ? body.numberOfCoupons : undefined;

  try {
    const bond = await issueBondForBusiness(issuerId, { termSeconds, numberOfCoupons });
    return NextResponse.json({ bond });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
