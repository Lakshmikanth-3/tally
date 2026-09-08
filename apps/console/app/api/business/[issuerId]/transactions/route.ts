import { NextRequest, NextResponse } from 'next/server';
import { parseUsdToMicros } from '@tally/seam';
import { getBusiness, ProcessorConnectedError, submitTransaction } from '@/lib/business';

export async function POST(req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.amountUSD !== 'string') {
    return NextResponse.json({ error: 'amountUSD (decimal dollar string, e.g. "42.50") is required' }, { status: 400 });
  }

  const timestampSeconds = typeof body?.timestampSeconds === 'number' ? body.timestampSeconds : Math.floor(Date.now() / 1000);

  try {
    const amountUSD = parseUsdToMicros(body.amountUSD);
    submitTransaction(issuerId, amountUSD, timestampSeconds);
    return NextResponse.json({ issuerId, amountUSD: amountUSD.toString(), timestampSeconds }, { status: 201 });
  } catch (err) {
    if (err instanceof ProcessorConnectedError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
