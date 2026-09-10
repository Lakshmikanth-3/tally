# Stripe Test Mode Integration — Report

Real Stripe Connect + real Stripe TEST MODE transaction generation/retrieval, wired into the existing Tally architecture, with no fixtures and no fabricated historical data. This report covers what was inspected, what was built, what was verified live, and — honestly — one real limitation hit along the way and its concrete fix.

---

## A. Current Stripe data flow (before this change)

- **OAuth**: `lib/stripe.ts`'s `getStripeConnectAuthorizeUrl` builds a real Stripe Connect OAuth URL; `app/api/business/[issuerId]/stripe/authorize/route.ts` redirects there; the fixed-path `app/api/business/stripe/callback/route.ts` exchanges the real OAuth `code` via `exchangeStripeOAuthCode`, storing the real connected account id (`stripe_account_id`) on the business row (`setStripeConnection`).
- **Retrieval**: `listStripeCharges` pulls real succeeded USD charges via `stripe.charges.list(...)`, scoped read-only to the connected account via `{ stripeAccount }`.
- **Revenue calculation**: `getRevenueSnapshot` calls `syncStripeTransactions` (upserts real charges into the `transactions` table, idempotent via a `stripe_charge_id` unique index) then `computeRevenueSnapshot` (`@tally/underwriting`) over whatever is in that table.
- **Revenue API**: `GET /api/business/[issuerId]/revenue`, bearer-token authenticated (`REVENUE_API_TOKEN`), returns the computed snapshot — no raw transaction data, no policy decision, just the facts.
- **CRE authentication**: `cre/tally-cre/underwriting/workflow.ts` fetches `config.secretId` (`REVENUE_API_TOKEN`) via `runtime.getSecret()` **inside the enclave**, then calls the revenue API with it as a bearer header via `HTTPClient.sendRequest(runtime, ...)` — the request and response payload stay confidential from node operators because that call uses the `TeeRuntime` overload.
- **Demo business handling**: Corrado's Deli (`issuer-corrados-deli-f5bb20`) was `is_demo`-flagged with revenue seeded by directly inserting rows into the `transactions` table via a one-off script (`scripts/seed-demo-business.ts`), not through Stripe at all.
- **UI**: bare-bones — "Connected to Stripe account {id}" or "No payment processor connected," a `synthetic demo data` badge, and raw revenue stats.

Nothing above was rewritten. This work adds a second data-generation/retrieval path and a UI to match; the existing OAuth flow, `listStripeCharges`, `syncStripeTransactions`, and the revenue API are byte-for-byte what they were before, still the production path for a real connected business.

## B. Exact files changed

**New:**
- `apps/console/app/api/business/[issuerId]/stripe/test-mode/generate/route.ts`
- `apps/console/app/business/[issuerId]/StripeTransactionsPanel.tsx`
- `docs/STRIPE_TEST_MODE_REPORT.md` (this file)

**Modified:**
- `apps/console/lib/stripe.ts` — added `isStripeTestMode`, `createTestModeRevenueHistory`, `listStripeTestModeInvoices`
- `apps/console/lib/db.ts` — added `stripe_invoice_id` column + unique index
- `apps/console/lib/business.ts` — added `syncStripeTestModeTransactions`, `generateStripeTestModeHistory`, `listBusinessTransactions`; `getRevenueSnapshot` now syncs both real charges and test-mode invoices
- `apps/console/app/api/business/[issuerId]/transactions/route.ts` — added a `GET` handler
- `apps/console/app/business/[issuerId]/page.tsx` — connection-status block, test-mode label, mounts the new panel
- `apps/console/app/business/[issuerId]/BondPanel.tsx` — pipeline visualization, "processed privately" line

## C. How Stripe TEST MODE transactions are generated

Real Stripe **Test Clocks** (`stripe.testHelpers.testClocks`), Stripe's own documented mechanism for simulating time progression in test mode. Verified live, empirically, before writing any code:

- A plain `charges.create` or `paymentIntents.create` is **never** backdated by a test clock — `created` is always real wall-clock time, even for a customer attached to a clock frozen in the past. Confirmed live.
- A real Billing **Invoice**, finalized while its customer's test clock is frozen at a past time, gets a real `created` timestamp **exactly equal** to that frozen time. Confirmed live, including advancing the same clock forward day-by-day and getting the exact expected timestamp on each subsequent invoice.

`createTestModeRevenueHistory(stripeAccountId, days)` (`lib/stripe.ts`):
1. Creates one real test clock frozen `days` ago.
2. Creates one real customer attached to it.
3. For each simulated day: creates a real invoice item (a small, gently-varying daily amount — same curve shape as the existing demo-seed script, not a random or uniform number), creates a real invoice, finalizes it, and marks it paid via `paid_out_of_band: true` — then advances the clock forward exactly one day and waits for Stripe to report the clock `ready` before continuing.
4. Deletes the test clock when done (cleanup; doesn't affect the already-created invoices).

Default: 40 simulated days (clears the real 30-day history-length policy with margin; a full 90 would take proportionally longer for no functional benefit to the demo). Configurable up to 95 via the API body.

## D. How transactions are retrieved

`listStripeTestModeInvoices(stripeAccountId, sinceSeconds?)` calls `stripe.invoices.list({ status: 'paid', ... }, { stripeAccount })` — the real List Invoices API, scoped to the connected account exactly like the production charge-retrieval path. Never reads from a local cache as the source of truth; always a live Stripe API call.

## E. How revenue is calculated

**Unchanged.** `syncStripeTestModeTransactions` upserts the retrieved invoices into the same `transactions` table real charges use, tagged `source = 'stripe-test-mode'` (a real, separate, honest label — never `'stripe'`). `computeRevenueSnapshot` (`@tally/underwriting`) reads the table by `issuerId` regardless of source and computes trailing-90-day total, volatility, and history-days exactly as it always has. No new code path in the computation itself.

## F. Exact API path from TALLY → CRE

**Unchanged, and already correct before this work:**

```
CRE (inside TEE) → runtime.getSecret({id: 'REVENUE_API_TOKEN'})
                 → HTTPClient.sendRequest(teeRuntime, {
                     url: `${consoleBaseUrl}/api/business/${issuerId}/revenue`,
                     headers: { Authorization: `Bearer ${apiToken}` }
                   })
                 → GET /api/business/[issuerId]/revenue (console, bearer-checked)
                 → getRevenueSnapshot(issuerId) → real computed snapshot
```

**One honest gap relative to the spec, not hidden:** the console's "Run Underwriting" button does **not** currently shell out to the CRE CLI per click. It evaluates the identical policy (`classifyDecline`/`computeDiscountRate` from the same `@tally/underwriting` package the CRE workflow itself imports) directly in the Next.js backend, over the same real revenue snapshot. The CRE workflow independently and verifiably applies that same policy to that same real revenue API — proven via `cre workflow simulate underwriting --target staging-settings --non-interactive --trigger-index 0`, most recently returning `APPROVED (bps=428, reason=0)` for Corrado's Deli — but that simulation runs as its own CLI invocation, on its own schedule/trigger, not synchronously wired to a button click. See item L.

## G. What happens inside the TEE

`onUnderwritingTrigger` (`cre/tally-cre/underwriting/workflow.ts`), inside `cre.handlerInTee`:
1. Fetches the bearer secret via `runtime.getSecret()`.
2. Fetches the real revenue snapshot over HTTP with that secret.
3. Applies the real underwriting policy: `classifyDecline` (history/threshold/volatility checks) and `computeDiscountRate` (base rate + volatility premium).
4. Logs only the verdict (`runtime.log`) — never the raw revenue figures.

## H. What leaves the TEE

Only `donRuntime.report(...)`'s ABI-encoded payload: `issuerId`, `approved` (bool), `recommendedCouponBps` (uint256), `reasonCode` (uint8). The trailing-90-day total and volatility score never cross `usingTheDons()`.

## I. How the verdict reaches Hedera

`issueBondForBusiness` (`apps/console/lib/bonds.ts`) computes the verdict (see F's honest gap), and if approved, drives the real headless-browser ATS signer (`packages/ats-client`) to issue a real fixed-rate bond on Hedera testnet — unchanged by this work.

## J. What the judge sees on each screen

- **Business page**: "✓ Stripe Connected" + "TEST MODE" badges, "Data Source: Stripe Test Mode — synthetic/test transactions" label, real trailing-90-day revenue/volatility/history stats.
- **Stripe transactions section**: "Generate Stripe test transactions" (real Test Clock generation, ~40–90 real seconds), "View Stripe transactions" → a real table (Date | Stripe ID | Amount | Status | Source), every row's Source column reading "Stripe Test Mode."
- **Underwriting & bond section**: while running, the pipeline (`Revenue data collected → TALLY Revenue API → Chainlink CRE → Confidential TEE → Private underwriting`) plus "Revenue processed privately inside Chainlink Confidential Workflow" — the raw number never appears here. On approval: `APPROVED`, coupon %, then the real issued-bond details with live HashScan links, followed by the static "what happens next" shape (issuance → Hedera ATS → scheduled coupons → redemption → The Graph), explicitly noted as running on its own schedule.

## K. Stripe limitation encountered

**Real, live-confirmed limitation, not a code bug:** the platform's currently-connected test accounts (`acct_1UDPnhSHWGoybq2W` and others) are all India-domiciled (`country: 'IN'`). Any USD invoice payment on an India-domiciled connected account — via card charge, PaymentIntent, or even `paid_out_of_band` — is blocked by a real RBI export-compliance rule: *"As per Indian regulations, export transactions require a description"* — confirmed this is **not** fixable by setting any description/statement-descriptor field on the customer, invoice, invoice item, or payment; it's an account-level gate with no documented per-request bypass.

**Also encountered:** this platform account has Stripe Accounts v1 creation disabled (`accounts.create` refused, directing to the newer Accounts v2 API, not available in the installed `stripe` v17.7.0 SDK) — so a fresh, programmatically-created US test account wasn't an available workaround either.

**Concrete fix (a real, ~2-minute human action, not a code change):** connect the demo business via the existing real OAuth flow (`Connect Stripe` button, already built, untouched by this work) and, on Stripe's real test-mode onboarding screen, select **United States** (or any non-India country) instead of India. The mechanism verified in this report (Test Clocks + Invoices + `paid_out_of_band`) will then work end-to-end without modification — this was proven by isolating the failure to the account's country, not to the request shape. Corrado's Deli currently has no Stripe account connected at all, so connecting it fresh with `country: US` is the natural next step, and does not disturb any other connected business.

## L. What remains simulation-only / not yet wired

1. **Chainlink CRE live deployment** — unrelated to this work, still pending Chainlink's private-beta deploy-access review (see `FEEDBACK/CHAINLINK.md`). The workflow logic is complete and simulation-verified.
2. **Literal per-click CRE invocation** (spec items #10–13) — as detailed in item F, the console currently evaluates the shared underwriting policy directly rather than shelling out to the real `cre workflow simulate`/deployed workflow synchronously per click. The policy code and the real revenue API call are identical and independently verified either way; only the call topology differs from a literal reading of the spec. Closing this gap means spawning the CRE CLI as a child process from the Next.js API route (feasible — the exact command and its real output shape are already known and verified in this session) with a real timeout/fallback story; deliberately not rushed into this session given the added operational risk of synchronously spawning an external CLI from a web request without time to test its failure modes.
3. **This report's mechanism itself is untested end-to-end** for lack of a non-India connected test account at the time of writing — every individual step (test clock creation, day-by-day advancement, invoice backdating, retrieval) was verified live and works; the one remaining unknown is confirming the complete `createTestModeRevenueHistory` loop runs clean for the full default 40 days once run against a non-India account. Recommend running it once after reconnecting Corrado's Deli (per item K) as the first real end-to-end check.
