import { NextRequest, NextResponse } from 'next/server';
import { armCouponForBond } from '@/lib/coupon-schedule';

/// Arms a real Hedera Scheduled Transaction for this bond's coupon,
/// expiring (and self-executing) at its real maturity date — see
/// lib/coupon-schedule.ts.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  try {
    const result = await armCouponForBond(issuerId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
