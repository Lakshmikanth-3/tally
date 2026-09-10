import { NextRequest, NextResponse } from 'next/server';
import { generateStripeTestModeHistory, getBusiness } from '@/lib/business';
import { isStripeTestMode } from '@/lib/stripe';

// Real Stripe API calls (a test clock advanced day-by-day, each day a real
// invoice create+finalize+pay) — comfortably over a typical serverless
// function's default timeout for anything beyond a handful of days.
export const maxDuration = 60;

const DEFAULT_DAYS = 40; // clears the real 30-day history-length policy with margin
const MAX_DAYS = 95; // matches the 90-day trailing window the underwriting policy actually reads

/// Triggers real Stripe TEST MODE transaction generation for a connected
/// business — see lib/stripe.ts's createTestModeRevenueHistory. This is a
/// clearly-labeled developer/demo control, not something a real connected
/// merchant's revenue sync path ever calls.
export async function POST(req: NextRequest, { params }: { params: Promise<{ issuerId: string }> }) {
  if (!isStripeTestMode()) {
    return NextResponse.json({ error: 'refusing: platform Stripe key is not a test-mode key' }, { status: 403 });
  }

  const { issuerId } = await params;
  const business = getBusiness(issuerId);
  if (!business) {
    return NextResponse.json({ error: `no registered business with issuerId ${issuerId}` }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const days = Math.min(MAX_DAYS, Math.max(1, Number(body?.days) || DEFAULT_DAYS));

  try {
    const result = await generateStripeTestModeHistory(issuerId, days);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
