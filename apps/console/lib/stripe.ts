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
