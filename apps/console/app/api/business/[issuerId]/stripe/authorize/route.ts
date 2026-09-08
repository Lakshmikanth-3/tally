import { NextRequest, NextResponse } from 'next/server';
import { getBusiness } from '@/lib/business';
import { getStripeConnectAuthorizeUrl } from '@/lib/stripe';

/// Kicks off the real Stripe Connect OAuth handshake — redirects the shop
/// to Stripe's own authorize page, never a Tally-hosted form asking for a
/// secret key. `issuerId` rides through as `state` since Stripe's callback
/// URL is fixed (see ../../../stripe/callback/route.ts) and can't itself
/// carry a dynamic path segment.
export async function GET(req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  try {
    return NextResponse.redirect(getStripeConnectAuthorizeUrl(issuerId));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
