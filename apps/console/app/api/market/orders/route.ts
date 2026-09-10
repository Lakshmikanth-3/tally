import { NextResponse } from 'next/server';
import { listMarketOrders } from '@/lib/secondary-market';

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
