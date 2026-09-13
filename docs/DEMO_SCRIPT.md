# Demo script

The complete, step-by-step walkthrough of Tally, from registration to
settlement. Every step lists what to do, what you should see, and **which
automated test proves it**, so you can check the demo is true before showing
it. For the recorded video's spoken narration, see
[`VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md).

Disclosed exceptions, visible in the product itself:

- **Demo businesses use synthetic revenue**, labelled *"Synthetic demo data —
  not a real business"* on every page that shows it. Everything downstream of
  that revenue is real.
- **The Chainlink confidential enclave isn't active yet** (Chainlink-side
  provisioning). Workflow runs are real but not confidential.
- **Redemption at maturity reverts on-chain.** It's not part of the demo.
- **The Graph's register is empty today.** Settlement events are anchored on
  Hedera; the subgraph indexes the Sepolia copy, which has none yet.

---

## 0. Preflight — run before every demo

```bash
cd apps/console
pnpm test            # 21 unit tests (policy, schedules, database layer)
pnpm dev             # leave running on http://localhost:3000
pnpm test:api        # 20 API tests: validation, auth, signing guard
pnpm test:ui         # 9 browser tests: pages, registration, underwriting
pnpm test:proof      # 12 on-chain checks against public infrastructure
```

**Expect** every suite green, except `test:proof`'s *"the register contains
indexed lifecycle events"* (see exceptions above). If anything else fails,
don't claim that step on camera.

To run the same API and UI suites against the hosted deployment:
`TALLY_E2E_BASE_URL=https://tally-eight-jet.vercel.app pnpm test:api`.

**Prepare a business that can issue live.** Both existing demo businesses
already hold an outstanding bond, and a business can't hold two:

```bash
curl -s -X POST http://localhost:3000/api/business/register \
  -H 'content-type: application/json' -d '{"name":"Harbor Coffee"}'
npx tsx --env-file=.env.local scripts/seed-demo-business.ts <issuerId from above>
```

---

## 1. The pitch

**Do:** open `http://localhost:3000/`.

**Expect:** the headline *"A shop's verified revenue becomes a short bond"*,
four live platform stats (businesses, bonds issued, face value, transactions),
and the seven-step pipeline.

**Verified by:** `test:ui` › *landing page › renders the hero, the coin video,
and live platform stats*.

---

## 2. Register a business

**Do:** click **Add a business**, enter a name, submit.

**Expect:** you land on the new business's page. It shows *"No payment
processor connected yet."* and **$0.00** revenue — nothing invented.

**Verified by:** `test:ui` › *registration and underwriting › registers a real
business…*; `test:api` › *business registration* (missing/blank names
rejected, issuer id derived from the name, row really persisted).

---

## 3. Underwriting declines a business with no history

**Do:** on that new business, click **Run underwriting & issue bond**.

**Expect:** **DECLINED** — *"Fewer than 30 days of revenue history"*. Hedera
issuance shows as *not reached*.

**Verified by:** `test:ui` › *…declines it for insufficient history*.

---

## 4. Revenue from Stripe (or disclosed synthetic data)

**Do:** open the business you prepared in step 0.

**Expect:** the synthetic-data badge, about **$14,000** trailing 90-day
revenue and 95 days of history. On a Stripe-connected business, **Connect
Stripe** runs the real OAuth handshake instead, and revenue is pulled from
Stripe on every read.

**The policy** (`packages/underwriting/src/pricing.ts`): approve only with at
least 30 days of history, at least $3,000 of 90-day revenue, and a volatility
score of 40 or less. Coupon rate = 4.00% + 0.04% per volatility point above 10.

**Verified by:** unit tests in `packages/underwriting` (11 tests);
`test:api` › *manual transactions* (amounts stored as 6-decimal fixed point,
never floats).

---

## 5. Issue a real bond on Hedera

**Do:** click **Run underwriting & issue bond** on the prepared business.
Wait 20–40 seconds.

**Expect:** **APPROVED**, a coupon rate, **✓ Issued on Hedera testnet**, and
HashScan links to the bond contract and issuance transaction.

**How:** the server drives a real headless Chromium with the custodian key,
because Hedera's Asset Tokenization Studio SDK only signs in a browser. It
deploys the bond through the ATS factory, then mints the units.

**Verified by:** `test:ui` › *an issued bond › shows real HashScan links*;
`test:proof` › *Hedera: the bond is real* (deployed contract, `totalSupply` = 1).

---

## 6. Coupons pay themselves

**Do:** open `http://localhost:3000/business/issuer-lifecycle-demo-co-c89705`
and scroll to the coupon schedule. Open
`https://hashscan.io/testnet/schedule/0.0.10519300`.

**Expect:** three coupons, each with a Hedera schedule ID and ✓ on time. On
HashScan, the schedule executed at its expiry.

**How:** each coupon is a `ScheduleCreateTransaction` with
`setWaitForExpiry(true)`. The network executes it at the due date — no keeper
or cron. A background sweep then reads the mirror node's consensus timestamp
and anchors an on-time/late event on the `SettlementAnchor` contract.

**Verified by:** `test:proof` › *Hedera: coupons paid themselves* (all three
schedules executed within 5 s of expiry, three 0.12809615 ℏ receipts at the
separate bondholder account `0.0.10481844`, anchors on `0.0.10501789`);
`test:api` › *the coupon schedule is persisted and every coupon was anchored
on time*.

---

## 7. Secondary market with on-chain compliance

**Do:** open `http://localhost:3000/market`.

**Expect:** the order book, rebuilt from the `SecondaryMarket` contract's
on-chain events.

**How:** an account without KYC on the bond was refused by the ATS token
itself with `transfer restricted: counterparty not compliant`; the custodian's
fill succeeded. Details in `DEMO.md` §4.

**Verified by:** `test:ui` › *secondary market*; `test:api` › *the market
order book is served from on-chain logs*; `test:proof` › *the SecondaryMarket
contract has real order events*.

---

## 8. Chainlink CRE runs the underwriting

**Do:**

```bash
cd cre/tally-cre
cre execution list tally-underwriting-staging
cre execution logs <an execution id from the list>
```

**Expect:** `SUCCESS` every minute, and nine nodes each logging
`Underwriting complete for issuer-corrados-deli-f5bb20: approved=true bps=460`.

**How:** the workflow fetches the revenue snapshot with a bearer secret,
applies the same policy, and reports only the verdict. 460 bps = 4.00% +
(volatility 25 − 10) × 0.04%.

**Verified by:** `test:api` › *revenue endpoint* (refuses missing and wrong
tokens; returns exactly four aggregate fields and no transaction rows);
`cre/tally-cre/underwriting/workflow.test.ts`.

---

## 9. Signing is protected

**Do:** nothing to show on screen. Mention it if asked.

**Expect:** any request to a value-moving route (issue, arm coupons, redeem,
list, bid, fill) that arrives through a proxy is refused with `403`; the
hosted deployment refuses them with `501`.

**Verified by:** `test:api` › *signing guard* (7 tests, all using ids that
don't exist, so a failure could never sign anything).

---

## 10. Verify everything independently

**Do:** open `http://localhost:3000/proof`.

**Expect:** every contract, account and endpoint with public explorer links
across Hedera testnet, Ethereum Sepolia and The Graph.

**Verified by:** `test:ui` › *verification page*; `test:proof` › *Sepolia:
mirror deployment* and *the subgraph is deployed, synced and has no indexing
errors*.

---

## Test totals

| Suite | Command | Tests |
|---|---|---|
| Unit — seam, underwriting, scheduler | `pnpm test` (repo root) | 26 |
| Unit — console, incl. real-database tests | `pnpm test` (apps/console) | 21 |
| Contracts | `pnpm contracts:test` | 8 |
| API contract | `pnpm test:api` | 20 |
| Browser UI | `pnpm test:ui` | 9 |
| Live on-chain proof | `pnpm test:proof` | 12 |
| **Total** | | **96** |
