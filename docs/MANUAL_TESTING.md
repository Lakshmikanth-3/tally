# Manual testing guide

How to exercise Tally end to end yourself at `http://localhost:3000`, and what each screen should show if it's working. Everything below hits real infrastructure — real Stripe test mode, real Hedera testnet, a real deployed subgraph.

## 0. Start it

```bash
cd C:/hack/eth/tally/apps/console
npx next dev
```

Open `http://localhost:3000`.

> **First click on any page is slow in dev.** Next.js compiles each route on first request, and the bond routes pull in the whole ATS + headless-browser signer chain — expect 30–90 s the *first* time you hit underwriting, then instant afterwards. That's build cost, not app latency. `npx next build && npx next start` avoids it entirely.

---

## 1. Landing page — `/`

**What to check**
- The Tally coin video is rotating on the right and never stops (it loops).
- The four stat cards show numbers, and they count up on load.
- "How it works" shows 7 steps; "Why it's real" shows 4 cards.
- Hovering a card lifts it; the arrows between pipeline steps pulse.

**How to verify the stats are real, not hardcoded:** register a business (step 3) and come back — "Businesses registered" goes up by one.

---

## 2. Verify on-chain — `/proof`

This is the page to show a judge who doesn't trust the UI.

**What to check**
- Three groups: Hedera testnet, Ethereum Sepolia, The Graph.
- Every row is a clickable link out to a public explorer.
- Any bonds this instance has issued appear at the top with their real token id and transaction.

**Verify independently:** click *SettlementAnchor* under Hedera testnet. HashScan should load contract `0.0.10501789` and show real transactions against it. Do the same for the Sepolia rows on Etherscan.

**Why two networks:** the Hedera deployment is the real product; the Sepolia copy exists only because Subgraph Studio can't index Hedera.

---

## 3. Register a business — `/register`

1. Click **Register** in the nav.
2. Type any name, e.g. `Test Bakery`.
3. Submit.

**Expected:** you land on `/business/issuer-test-bakery-<hex>`.

**What to check on the business page**
- 90-day revenue reads **$0.00**, volatility **0/100**, history **0d**.
- "No payment processor connected yet."

This is the honesty check — a brand new business has no revenue, and the app says so instead of inventing a number.

---

## 4. Run underwriting on a business with no revenue

On that new business, click **Run underwriting & issue bond**.

**Expected (takes up to ~90 s the first time, then a few seconds):**
- The pipeline shows: Revenue snapshot computed → Underwriting policy applied → Verdict returned.
- The final step, *Hedera ATS issuance*, shows **"— not reached (declined)"**.
- A big red **DECLINED**.
- `Declined: Fewer than 30 days of revenue history`.

This is correct behaviour, not a bug: the real policy requires ≥30 days of history and ≥$3,000 trailing-90-day revenue. A business with nothing gets declined.

---

## 5. See an approved bond — `/business/issuer-corrados-deli-f5bb20`

Go to **Dashboard** and open **Corrados Deli** (it carries clearly-labelled synthetic demo revenue — the badge says so on the page).

**What to check**
- Revenue ≈ `$14,591`, volatility `17/100`, history `96d`.
- Under *Underwriting & bond*: a green **✓ Issued on Hedera testnet** badge.
- Coupon rate, face value, symbol/ISIN, bond token, issuance tx, maturity.

**Verify on-chain:** click the **Bond token** link → HashScan opens the real token. Click the **Issuance tx** link → HashScan shows the real transaction that created it. These are live testnet records, not screenshots.

---

## 6. Stripe test-mode transactions

On a business with Stripe connected, the *Stripe transactions* section appears.

- **View Stripe transactions** → a real table: Date, Stripe ID, Amount, Status, Source. Every row's Source says where it came from.
- **Generate Stripe test transactions** → creates real Stripe test-mode invoices, backdated across ~40 simulated days using Stripe's own Test Clocks.

> **Known limitation.** All Stripe accounts currently connected here are India-domiciled. Stripe enforces a real RBI export-compliance rule that rejects USD invoice payment on those accounts, so generation fails with an explicit error saying exactly that. The page detects this and shows a **Reconnect Stripe (US test account)** button. Reconnect via that button — the authorize URL now prefills country = US in test mode — and generation works. Full detail in `docs/STRIPE_TEST_MODE_REPORT.md`.

After a successful generation, revenue on the page jumps to roughly $6,000 over 40 days of history — enough to clear the policy — and underwriting will then **approve** and issue a real bond.

---

## 7. Query the public register

Open the [Studio playground](https://thegraph.com/studio/subgraph/tally-register) and paste the query from `/proof`:

```graphql
{
  lifecycleEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
    kind
    timestamp
    onTime
    hcsTxId
    bond { issuer }
  }
  issuerStandings { id bondsIssued couponsOnTime couponsLate }
}
```

**Expected today:** the query succeeds with no indexing errors, but both lists are **empty**. Settlement events are anchored on the Hedera `SettlementAnchor`, while the subgraph indexes the Sepolia copy, where nothing has been anchored yet. `pnpm test:proof` tracks this (*the register contains indexed lifecycle events*). Once events are anchored on Sepolia, this shows them and an `IssuerStanding` rollup.

---

## 8. Chainlink CRE underwriting

```bash
export PATH="$PATH:/c/Users/sl/AppData/Local/Programs/cre:/c/Users/sl/.bun/bin"
cd C:/hack/eth/tally/cre/tally-cre
cre workflow simulate underwriting --target staging-settings --non-interactive --trigger-index 0
```

**Expected:** `APPROVED (bps=…, reason=0)` — the workflow fetched Corrado's Deli's real revenue over the authenticated API and ran the underwriting policy inside the (simulated) TEE.

> Both flags are required. Without `--target` and `--trigger-index` the CLI hangs on an interactive picker with no prompt.

**Status:** the workflow is **deployed and executing live** on Chainlink's real DON, not just simulated:

```bash
cre workflow list --registry private          # tally-underwriting-staging, ACTIVE
cre execution list tally-underwriting-staging # real cron executions, SUCCESS
```

> **Live executions need the console publicly reachable.** Chainlink's nodes
> can't reach `localhost`. Run `ngrok http 3000`, put that URL in
> `underwriting/config.staging.json`'s `consoleBaseUrl`, and redeploy
> (`cre workflow deploy underwriting --target staging-settings --yes`).
> Without it, executions fail with `Revenue fetch failed with status: 400`.

> **The TEE enclave is not actually running.** Even on a `SUCCESS` execution the
> `confidential-workflows` capability fails with `cannot validate enclave config:
> DON members not set` — Chainlink-side provisioning. The run is real; it is
> **not** confidential. Don't describe it as such.

The console's "Run underwriting" button applies the *same* policy (same
`@tally/underwriting` package) in Tally's backend — the UI says so explicitly
rather than implying the click invoked CRE.

---

## 9. Coupon schedule — the strongest thing to check

`/business/issuer-lifecycle-demo-co-c89705` → **Coupon schedule**

**Expected:** three coupons, each with a real Hedera schedule ID and "✓ on time".

Verify Hedera really executed them itself, with no keeper:

```bash
curl -s https://testnet.mirrornode.hedera.com/api/v1/schedules/0.0.10519300
# executed_timestamp is populated and matches the due date
```

And that real HBAR actually moved to the bondholder:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=0.0.10481844&transactiontype=CRYPTOTRANSFER&order=desc&limit=10"
```

> You'll see a **fourth**, larger receipt (0.38428845 ℏ) alongside the three
> 0.12809615 ℏ coupons. That's real and expected: multi-coupon support landed
> while this bond was live, and the older single-bullet code path armed one
> whole-term coupon before the new code took effect.

**Arming more coupons.** Hedera refuses a schedule expiring more than ~60 days
out, so a fresh 90-day bond can't arm anything yet — the button says so. Issue a
short-term bond to see arming succeed immediately:

```bash
curl -X POST http://localhost:3000/api/business/<issuerId>/bond/issue   -H 'Content-Type: application/json'   -d '{"termSeconds":1500,"numberOfCoupons":3}'
```

---

## 10. Secondary market — `/market`

**What to check**

- The order book renders from **real on-chain logs** (Hedera Mirror Node), not a local table.
- "Place a bid" lists every real issued bond.
- On an issued bond's page, "List on secondary market" places a real ask **and** escrows the unit.

**The compliance rejection (the interesting one).** Fill an order using a second
account that was never KYC'd on that bond — the gear icon next to "Attempt fill"
takes a taker private key:

**Expected:** `transfer restricted: counterparty not compliant` — refused by the
ATS token itself, not by this UI. Filling as the custodian (leave the key blank)
succeeds instead. Both are real on-chain outcomes.

---

## 11. Redemption — known failure

On a matured bond, **Redemption** → "Redeem at maturity".

**Expected:** it **fails.** `Bond.fullRedeemAtMaturity` reverts with empty revert
data even though every precondition is satisfied on-chain. This is a known,
documented issue — see `packages/ats-client/src/redeem.ts` for everything ruled
out. On a bond that hasn't matured you'll get an honest "not yet matured" message
instead.

---

## 12. The value-moving routes are guarded

Routes that spend real funds refuse proxied callers, so running behind a tunnel
doesn't publish them:

```bash
# Local — passes the guard (400 = rejected on the empty body, not the guard)
curl -s -o /dev/null -w '%{http_code}
' -X POST http://localhost:3000/api/market/orders   -H 'Content-Type: application/json' -d '{}'

# Pretending to arrive through a tunnel — refused
curl -s -X POST http://localhost:3000/api/market/orders   -H 'X-Forwarded-For: 203.0.113.9' -H 'Content-Type: application/json' -d '{}'
```

**Expected:** `400` then a `403` explaining why. See `apps/console/lib/api-guard.ts`.

---

## 13. Hosted mode

What the hosted Vercel deployment runs:

```bash
TALLY_HOSTED=1 npx next dev -p 3100
```

**Expected:** a banner on every page, the same live data as the local
console (both read the shared Postgres database), registration and Stripe
sync working, and every signing action (issue, arm coupons, escrow, fill)
refused with `501` and a plain explanation. The lifecycle sweep stays off —
it has no key and no browser there.

---

## Automated tests

```bash
# Everything at once, from the repo root
pnpm typecheck        # all 6 packages
pnpm test             # 47 unit tests across seam / underwriting / scheduler / console
pnpm contracts:test   # 8 Foundry tests, including a 256-run fuzz

# Against the real running app (starts `next dev` on :3000 if none is running)
cd apps/console
pnpm test:api         # 20 API contract tests — validation, auth, signing guard
pnpm test:ui          # 9 browser tests — real UI, real routes
pnpm test:proof       # 12 live checks of on-chain claims (Hedera, Sepolia, The Graph)

# Same API/UI suites against the hosted deployment
TALLY_E2E_BASE_URL=https://tally-eight-jet.vercel.app pnpm test:api
```

The e2e suite registers a real business, asserts it's honestly declined, checks the explorer links, and **deletes exactly the rows it created** afterwards so the dashboard isn't polluted.

**Totals: 47 unit + 8 contract + 20 API + 9 UI + 12 live-proof = 96 tests.**
