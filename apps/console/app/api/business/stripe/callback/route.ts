import { NextRequest, NextResponse } from 'next/server';
import { getBusiness, setStripeConnection } from '@/lib/business';
import { exchangeStripeOAuthCode } from '@/lib/stripe';

/// Fixed path (no issuerId in the URL) because this must exactly match the
/// single redirect_uri registered with Stripe's Connect platform — the
/// issuerId rides back through the OAuth `state` param instead, set when
/// authorize/route.ts built the authorize URL.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const issuerId = req.nextUrl.searchParams.get('state');
  const oauthError = req.nextUrl.searchParams.get('error_description') ?? req.nextUrl.searchParams.get('error');

  if (oauthError) {
    return NextResponse.json({ error: `Stripe declined the connection: ${oauthError}` }, { status: 400 });
  }
  if (!code || !issuerId) {
    return NextResponse.json({ error: 'missing code or state on Stripe OAuth callback' }, { status: 400 });
  }

  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  try {
    const { stripeAccountId, accessToken } = await exchangeStripeOAuthCode(code);
    setStripeConnection(issuerId, stripeAccountId, accessToken);
    return NextResponse.redirect(new URL(`/business/${issuerId}`, req.url));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
