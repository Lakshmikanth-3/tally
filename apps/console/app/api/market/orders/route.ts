import { NextRequest, NextResponse } from 'next/server';
import { listMarketOrders, placeMarketOrder } from '@/lib/secondary-market';

/// Real order book, read directly from on-chain event logs on every
/// request — see lib/secondary-market.ts for why events (not a local
/// table) are the source of truth.
export async function GET() {
  try {
    const orders = await listMarketOrders();
    return NextResponse.json({ orders });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

/// Places a real bid against any real bond — unlike an ask (see
/// app/api/business/[issuerId]/market/route.ts), a bid is a buyer's offer
/// and never deposits anything: there's no token to escrow until the bid
/// is actually filled by a real holder. Signed by Tally's own custodian
/// key for now, same as every other real on-chain action this console
/// takes on a user's behalf.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const bondId = typeof body?.bondId === 'string' ? body.bondId : null;
  const bondToken = typeof body?.bondToken === 'string' ? body.bondToken : null;
  const priceUSD = typeof body?.priceUSD === 'string' ? body.priceUSD : null;
  if (!bondId || !bondToken || !priceUSD) {
    return NextResponse.json({ error: 'bondId, bondToken, and priceUSD (6-decimal fixed-point string) are required' }, { status: 400 });
  }

  try {
    const result = await placeMarketOrder({ bondId, bondToken, priceUSD, quantity: '1', isBid: true });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
