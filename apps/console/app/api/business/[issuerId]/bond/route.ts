import { NextRequest, NextResponse } from 'next/server';
import { getBusiness } from '@/lib/business';
import { getLatestBond } from '@/lib/bonds';

/// Returns this business's latest bond attempt (declined/issued/failed), or
/// null if none has been attempted yet — read by the business page to show
/// state without re-triggering a real issuance.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  return NextResponse.json({ bond: getLatestBond(issuerId) });
}
