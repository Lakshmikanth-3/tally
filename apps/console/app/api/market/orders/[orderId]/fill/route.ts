import { NextRequest, NextResponse } from 'next/server';
import { fillMarketOrder } from '@/lib/secondary-market';

/// Attempts a real fill. `takerPrivateKeyHex` is optional — omitted, it
/// fills as Tally's own custodian (the only funded, already-KYC'd account
/// this deployment has, so that fill succeeds). Supplying a different
/// account's key lets you demonstrate the real compliance-rejection path
/// for real — see lib/secondary-market.ts's fillMarketOrder, which
/// surfaces whatever the chain actually decides, never a pre-check.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const body = await req.json().catch(() => ({}));

  const takerPrivateKeyHex: string | undefined = body?.takerPrivateKeyHex || undefined;
  const effectiveKey = takerPrivateKeyHex ?? process.env.HEDERA_ECDSA_PRIVATE_KEY;
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
