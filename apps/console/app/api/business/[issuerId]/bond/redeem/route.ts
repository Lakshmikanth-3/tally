import { NextRequest, NextResponse } from 'next/server';
import { requireTrustedCaller } from '@/lib/api-guard';
import { redeemBondForBusiness } from '@/lib/redemption';

/// Executes the real ATS redemption for a matured bond and anchors a real
/// Redeemed lifecycle event — see lib/redemption.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const refusal = requireTrustedCaller(req);
  if (refusal) return refusal;

  const { issuerId } = await params;
  try {
    const result = await redeemBondForBusiness(issuerId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
