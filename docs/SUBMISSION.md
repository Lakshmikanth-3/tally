# ETHOnline 2026 submission text

## Description

Tally turns a small business's real revenue into a short-term, fixed-rate bond — underwritten in private, priced in public, and paid back automatically.

**The problem.** Plenty of small shops have a year of steady card sales but no bank credit history, so they can't borrow against the one thing that actually predicts repayment: their revenue. When they do get credit, underwriting is manual, opaque and one-off — and their good repayment record never follows them to the next lender.

**How Tally works:**

1. **Connect revenue.** A business registers and connects its Stripe account through Stripe Connect OAuth. Tally pulls its real charges; the business never types in a number.
2. **Underwrite.** Tally reduces the transaction history to three facts: trailing 90-day revenue, days of history, and a daily-volatility score. A deterministic policy decides: at least 30 days of history, at least $3,000 of 90-day revenue, and volatility under a cap. The coupon rate starts at 4% and rises with volatility. The same policy runs as a Chainlink CRE workflow on Chainlink's network, which reads the revenue through an authenticated API and reports only the verdict — never the raw revenue.
3. **Issue.** An approved business gets a real fixed-rate bond, issued through Hedera's Asset Tokenization Studio (ATS) on Hedera testnet, with its units minted to a custodian.
4. **Settle itself.** Each coupon payment is a Hedera Scheduled Transaction that waits for its due date. The Hedera network executes it by itself — no keeper bot, no cron job — sending real HBAR to the bondholder. Tally then reads the network's own consensus timestamp to record whether it was on time, and anchors that event on-chain.
5. **Resell.** A secondary market lets holders list and fill orders. The bond token enforces compliance itself: a buyer without KYC is rejected on-chain by the token contract, not by our interface.
6. **Build public credit.** Lifecycle events are indexed by a subgraph on The Graph, so any future lender can query an issuer's repayment history.

**What's real, verified live:** a bond (`0.0.10519251`) with three coupons that Hedera executed unattended at their due dates, HBAR received by a separate bondholder account, a secondary-market fill and a real on-chain compliance rejection, and a Chainlink workflow where nine nodes independently reach the same underwriting verdict every minute. A 96-test suite — including 12 tests that check these claims directly against the Hedera mirror node, JSON-RPC, Sepolia and The Graph — backs up every claim above.

**What's honestly not done:** Chainlink's confidential enclave for our private-beta workflow isn't provisioned yet, so runs aren't confidential today; redemption at maturity reverts on-chain; the subgraph is live but its register is still empty, because settlement events are anchored on Hedera while The Graph indexes our Sepolia copy; and demo businesses use clearly-labelled synthetic revenue.

---

## How it's made

**Stack.** A pnpm + Turborepo TypeScript monorepo: a Next.js 15 console (`apps/console`), four packages (`seam` for shared types and fixed-point money, `underwriting` for the revenue snapshot and pricing policy, `ats-client` for Hedera ATS, `scheduler` for Hedera Scheduled Transactions), Solidity contracts in Foundry, a subgraph, and a Chainlink CRE workflow. State lives in Postgres (Neon); the app is deployed on Vercel.

**Money is never a float.** Every amount is a 6-decimal fixed-point `bigint` end to end, from Stripe cents through underwriting to the bond's face value.

**Hedera — three different services, each doing real work.**
- *Asset Tokenization Studio* issues a genuine fixed-rate bond rather than a token we invented, and gives us compliance for free: KYC, whitelists and transfer restrictions are enforced inside the token.
- *Scheduled Transactions* with `setWaitForExpiry(true)` are the whole settlement engine. Hedera refuses schedules more than about 60 days out, so Tally stores the full coupon calendar at issuance and a background sweep arms each coupon once it comes within that window.
- *The Mirror Node* is our source of truth: on-time status is derived from the network's consensus timestamp, and the secondary-market order book is rebuilt from contract event logs instead of a database table.

**The hackiest part: signing ATS transactions from a server.** The ATS SDK only signs inside a web browser — it checks for `window`, then needs a MetaMask-style `window.ethereum`. Plain Node.js fails, and faking `window` only moves the error. So Tally launches a real headless Chromium through Playwright, injects a minimal EIP-1193 provider backed by an `ethers` wallet holding the custodian key, and serves an esbuild bundle of the SDK over `http://localhost`, because the SDK calls `crypto.randomUUID()`, which needs a secure context. Getting the SDK to bundle for the browser meant stubbing server-only logging and custodial-wallet modules it imports eagerly, aliasing the Hedera SDK to its browser build by absolute file path (esbuild ignores the `browser` field when `exports` is present), and defining `global` as `globalThis`. We also found and worked around an SDK behaviour where a `0.0.x` account id resolves to a long-zero EVM address that isn't the one holding the tokens.

**Chainlink CRE.** The underwriting workflow is written in TypeScript against the CRE SDK and deployed to Chainlink's private registry. It fetches the revenue snapshot with a secret from CRE's Vault, applies the same policy as our `underwriting` package, and returns only approve/decline and the coupon rate. That gives us decentralised consensus on the credit decision instead of trusting our own server, and it's designed so the raw revenue would stay inside a TEE once Chainlink enables confidential execution for our workflow.

**The Graph.** A subgraph indexes `LifecycleEvent`s (issued, coupon, resale, redeemed, defaulted) into per-issuer standings — bonds issued, coupons on time, coupons late — so repayment history becomes a public, queryable credit record. Subgraph Studio can't index Hedera, so we deploy the same contracts to Ethereum Sepolia and index that copy.

**Stripe.** Stripe Connect OAuth reads each business's charges from its own connected account, deduplicated by charge id so revenue is never double-counted. For testing, Stripe Test Clocks generate genuinely backdated paid invoices through Stripe's API rather than inserting fake rows.

**Security.** Routes that move value refuse any request that arrives through a proxy or tunnel unless it carries an admin token, and the hosted deployment refuses them outright; the revenue endpoint uses constant-time bearer-token comparison.

**Testing.** 96 tests: unit tests for the policy, schedules, money and database layer (including transaction rollback and duplicate-charge protection against the real database); Foundry tests with fuzzing; Playwright API and UI suites run against the real app; and a live-proof suite that checks every on-chain claim in our demo directly against public infrastructure.
