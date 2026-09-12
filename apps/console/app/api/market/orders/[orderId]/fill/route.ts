import { NextRequest, NextResponse } from 'next/server';
import { depositBondForResale, findBondByEvmDiamondAddress } from '@/lib/bonds';
import { fillMarketOrder, getOrder } from '@/lib/secondary-market';

/// Attempts a real fill. `takerPrivateKeyHex` is optional — omitted, it
/// fills as Tally's own custodian (the only funded, already-KYC'd account
/// this deployment has, so that fill succeeds). Supplying a different
/// account's key lets you demonstrate the real compliance-rejection path
/// for real — see lib/secondary-market.ts's fillMarketOrder, which
/// surfaces whatever the chain actually decides, never a pre-check.
///
/// A bid is different: SecondaryMarket.sol pays a bid's fill out to the
/// *maker* (the original bidder), never to whoever calls fillOrder — see
/// its own doc comment. So filling one first requires escrowing the real
/// unit being sold into the market contract, exactly like an ask's own
/// pre-fill deposit (lib/bonds.ts's depositBondForResale). Since Tally's
/// custodian is the only account this deployment ever actually holds bond
/// units under, that escrow — and the fill itself — is always a custodian
/// action for a bid; a supplied takerPrivateKeyHex would only vary the
/// *filler's* identity, which is meaningless here since a bid's compliance
/// gate checks the maker, not the filler, so it's ignored for a bid.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));
  const takerPrivateKeyHex: string | undefined = body?.takerPrivateKeyHex || undefined;

  let order;
  try {
    order = await getOrder(orderId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
  if (order.filled) {
    return NextResponse.json({ error: `order ${orderId} was already filled` }, { status: 409 });
  }

  if (order.isBid) {
    const bond = findBondByEvmDiamondAddress(order.bondToken);
    if (!bond || !bond.bondTokenId) {
      return NextResponse.json({ error: `no issued bond found for security ${order.bondToken}` }, { status: 404 });
    }
    try {
      await depositBondForResale(bond.bondTokenId);
    } catch (err) {
      return NextResponse.json({ error: `escrowing the unit for this bid failed: ${(err as Error).message}` }, { status: 502 });
    }
  }

  const effectiveKey = order.isBid ? process.env.HEDERA_ECDSA_PRIVATE_KEY : (takerPrivateKeyHex ?? process.env.HEDERA_ECDSA_PRIVATE_KEY);
  if (!effectiveKey) {
    return NextResponse.json({ error: 'server misconfigured: no taker key available' }, { status: 500 });
  }

  try {
    const result = await fillMarketOrder(orderId, effectiveKey);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
