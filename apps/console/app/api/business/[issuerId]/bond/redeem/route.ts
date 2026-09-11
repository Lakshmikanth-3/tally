import { NextRequest, NextResponse } from 'next/server';
import { redeemBondForBusiness } from '@/lib/redemption';

/// Executes the real ATS redemption for a matured bond and anchors a real
/// Redeemed lifecycle event — see lib/redemption.ts.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  try {
    const result = await redeemBondForBusiness(issuerId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
