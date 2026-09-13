import { NextRequest, NextResponse } from 'next/server';
import { requireTrustedCaller } from '@/lib/api-guard';
import { getLatestIssuedBond } from '@/lib/bonds';
import { armCouponForBond, listCouponPayments, planCouponSchedule } from '@/lib/coupon-schedule';

/// This bond's real coupon schedule — every payment it owes, with whichever
/// have actually been armed on Hedera and which have genuinely paid out.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  try {
    const bond = getLatestIssuedBond(issuerId);
    if (!bond || !bond.startingDateSeconds || !bond.maturityDateSeconds) {
      return NextResponse.json({ payments: [] });
    }
    // Planning is idempotent and pure bookkeeping (no chain calls), so a
    // bond issued before multi-coupon support still gets its real schedule
    // filled in the first time it's viewed.
    planCouponSchedule(bond);
    return NextResponse.json({ payments: listCouponPayments(issuerId, bond.createdAt) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

/// Arms every coupon that has come inside Hedera's real ~60-day scheduling
/// window — see lib/coupon-schedule.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const refusal = requireTrustedCaller(req);
  if (refusal) return refusal;

  const { issuerId } = await params;
  try {
    const armed = await armCouponForBond(issuerId);
    return NextResponse.json({ armed });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
