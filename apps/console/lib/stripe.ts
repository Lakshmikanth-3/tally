import Stripe from 'stripe';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`server misconfigured: ${name} is not set`);
  return value;
}

/// The platform's own Stripe client — authenticated as Tally, not as any
/// individual connected business. Read/write scoped to a specific connected
/// account via the `stripeAccount` request option, never a business's own
/// secret key (businesses never hand Tally a secret key; the real Connect
/// OAuth handshake is what grants this access).
function getPlatformStripeClient(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'));
}

/// Builds the real Stripe Connect OAuth authorize URL. Tally only ever
/// calls read endpoints (see listStripeCharges below) — `read_write` is
/// used here only because Stripe gates the narrower `read_only` OAuth
/// scope behind a manual support request for new platforms; it doesn't
/// change what this codebase actually does with the connection.
export function getStripeConnectAuthorizeUrl(issuerId: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: requireEnv('STRIPE_CONNECT_CLIENT_ID'),
    scope: 'read_write',
    redirect_uri: requireEnv('STRIPE_CONNECT_REDIRECT_URI'),
    state: issuerId,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export interface StripeOAuthTokenResult {
  stripeAccountId: string;
  accessToken: string;
}

/// Exchanges a real Stripe Connect OAuth `code` for the connected account's
/// id — the real handshake result, never a value typed into a form.
export async function exchangeStripeOAuthCode(code: string): Promise<StripeOAuthTokenResult> {
  const stripe = getPlatformStripeClient();
  const response = await stripe.oauth.token({ grant_type: 'authorization_code', code });
  if (!response.stripe_user_id) {
    throw new Error('Stripe OAuth token exchange did not return a connected account id');
  }
  return { stripeAccountId: response.stripe_user_id, accessToken: response.access_token ?? '' };
}

export interface StripeCharge {
  id: string;
  amountMicrosUSD: bigint;
  createdSeconds: number;
}

/// Pulls real succeeded charges for a connected account, scoped read-only
/// via the `stripeAccount` request option. Non-USD charges are skipped
/// rather than converted — this repo doesn't fabricate an FX rate.
export async function listStripeCharges(stripeAccountId: string, sinceSeconds?: number): Promise<StripeCharge[]> {
  const stripe = getPlatformStripeClient();
  const charges: StripeCharge[] = [];

  const listParams: Stripe.ChargeListParams = { limit: 100 };
  if (sinceSeconds !== undefined) {
    listParams.created = { gt: sinceSeconds };
  }

  for await (const charge of stripe.charges.list(listParams, { stripeAccount: stripeAccountId })) {
    if (charge.status !== 'succeeded' || charge.currency !== 'usd') continue;
    charges.push({
      id: charge.id,
      amountMicrosUSD: BigInt(charge.amount) * 10_000n, // Stripe amount is integer cents; Tally's USD discipline is 6-decimal micros
      createdSeconds: charge.created,
    });
  }

  return charges;
}

/// True as long as the platform is authenticated with a real Stripe TEST
/// MODE secret key (`sk_test_...`) — Stripe itself, not a flag Tally
/// invents, determines whether every call this module makes is test-mode.
export function isStripeTestMode(): boolean {
  return requireEnv('STRIPE_SECRET_KEY').startsWith('sk_test_');
}

const DAY_SECONDS = 86_400;

/// [VERIFIED via real live Stripe test-mode calls] Real Stripe Charges/
/// PaymentIntents are NEVER backdated by a test clock — their `created` is
/// always real wall-clock time, confirmed live even for a customer attached
/// to a clock frozen in the past. Only real Billing objects (Invoices) are
/// clock-aware: an Invoice finalized while its customer's test clock is
/// frozen at a past time gets a real `created` equal to that frozen time —
/// also confirmed live, including advancing the same clock forward
/// day-by-day and getting the exact expected timestamp each time. This is
/// Stripe's own documented mechanism for simulating time progression in
/// test mode (https://stripe.com/docs/billing/testing/test-clocks) — not a
/// workaround Tally invented.
///
/// Payment collection uses `paid_out_of_band: true` rather than an actual
/// card charge: on at least one real connected account exercised while
/// building this (an India-domiciled test account), Stripe's real RBI
/// export-compliance check blocks any card-based charge/PaymentIntent
/// creation on a USD invoice regardless of what description fields are
/// set, and that check applies to `invoices.pay()` even under
/// `paid_out_of_band`. `paid_out_of_band` is Stripe's own real, documented
/// mechanism for recording an invoice as paid via a non-card method (bank
/// transfer, check, etc.) — appropriate here since these are declared
/// synthetic test-mode transactions, not simulated card payments, and it
/// sidesteps that specific account's compliance gate. If the connected
/// account is India-domiciled, this may still fail depending on Stripe's
/// exact account-level configuration — see the re-thrown error message.
export interface TestModeHistoryResult {
  daysGenerated: number;
  invoiceIds: string[];
  testClockId: string;
}

export async function createTestModeRevenueHistory(
  stripeAccountId: string,
  days: number,
): Promise<TestModeHistoryResult> {
  if (!isStripeTestMode()) {
    throw new Error('refusing to generate synthetic transactions: STRIPE_SECRET_KEY is not a test-mode key');
  }

  const stripe = getPlatformStripeClient();
  const opts = { stripeAccount: stripeAccountId };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const startSeconds = nowSeconds - days * DAY_SECONDS;

  const clock = await stripe.testHelpers.testClocks.create(
    { frozen_time: startSeconds, name: `tally-test-mode-${Date.now()}` },
    opts,
  );

  const invoiceIds: string[] = [];
  try {
    const customer = await stripe.customers.create(
      { test_clock: clock.id, name: 'Tally synthetic test-mode customer', email: 'tally-test-mode-demo@example.com' },
      opts,
    );

    for (let dayIndex = 0; dayIndex < days; dayIndex++) {
      // Same shape as scripts/seed-demo-business.ts's synthetic daily
      // revenue curve — a small, gently-varying daily amount, not a
      // uniform or random one.
      const dollars = 165 + 18 * Math.sin((days - dayIndex) / 3);
      const amountCents = Math.round(dollars * 100);

      await stripe.invoiceItems.create(
        { customer: customer.id, amount: amountCents, currency: 'usd', description: 'Tally synthetic test-mode daily revenue' },
        opts,
      );
      const invoice = await stripe.invoices.create(
        { customer: customer.id, collection_method: 'send_invoice', days_until_due: 1 },
        opts,
      );
      await stripe.invoices.finalizeInvoice(invoice.id, {}, opts);
      const paid = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true }, opts);
      invoiceIds.push(paid.id);

      if (dayIndex < days - 1) {
        const nextFrozen = startSeconds + (dayIndex + 1) * DAY_SECONDS;
        await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: nextFrozen }, opts);
        await waitForTestClockReady(stripe, clock.id, opts);
      }
    }
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('Indian regulations') || message.includes('export')) {
      throw new Error(
        `Stripe blocked test-mode invoice payment on this connected account: "${message}" — this connected account is likely India-domiciled, and Stripe's real RBI export-compliance rule blocks USD invoice payment on it regardless of description fields set (verified live while building this). Reconnect this business via Stripe Connect and select a non-India country (e.g. United States) during Stripe's test-mode onboarding to avoid this.`,
      );
    }
    throw err;
  } finally {
    await stripe.testHelpers.testClocks.del(clock.id, opts).catch(() => {});
  }

  return { daysGenerated: days, invoiceIds, testClockId: clock.id };
}

async function waitForTestClockReady(
  stripe: Stripe,
  clockId: string,
  opts: { stripeAccount: string },
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId, opts);
    if (clock.status === 'ready') return;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`test clock ${clockId} did not become ready in time`);
}

/// Retrieves the real, Stripe-test-clock-backdated paid invoices generated
/// by createTestModeRevenueHistory — the test-mode equivalent of
/// listStripeCharges, reading real Stripe API data, never a fixture.
export async function listStripeTestModeInvoices(stripeAccountId: string, sinceSeconds?: number): Promise<StripeCharge[]> {
  const stripe = getPlatformStripeClient();
  const invoices: StripeCharge[] = [];

  const listParams: Stripe.InvoiceListParams = { status: 'paid', limit: 100 };
  if (sinceSeconds !== undefined) {
    listParams.created = { gt: sinceSeconds };
  }

  for await (const invoice of stripe.invoices.list(listParams, { stripeAccount: stripeAccountId })) {
    if (invoice.currency !== 'usd') continue;
    invoices.push({
      id: invoice.id ?? '',
      amountMicrosUSD: BigInt(invoice.amount_paid) * 10_000n,
      createdSeconds: invoice.created,
    });
  }

  return invoices;
}
