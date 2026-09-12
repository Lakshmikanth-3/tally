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

**Why two networks:** the Hedera deployment is the real product; the Sepolia copy exists only because Subgraph Studio can't index Hedera. Same deterministic addresses, deliberately.

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

**Expected:** real indexed events and an `IssuerStanding` rollup — the public repayment register.

---

## 8. Chainlink CRE underwriting

```bash
export PATH="$PATH:/c/Users/sl/AppData/Local/Programs/cre:/c/Users/sl/.bun/bin"
cd C:/hack/eth/tally/cre/tally-cre
cre workflow simulate underwriting --target staging-settings --non-interactive --trigger-index 0
```

**Expected:** `APPROVED (bps=…, reason=0)` — the workflow fetched Corrado's Deli's real revenue over the authenticated API and ran the underwriting policy inside the (simulated) TEE.

> Both flags are required. Without `--target` and `--trigger-index` the CLI hangs on an interactive picker with no prompt.

**Status:** the workflow is complete and simulation-verified. Live TEE deployment is pending Chainlink's Confidential Workflows private-beta access review. The console's "Run underwriting" button applies the *same* policy (same `@tally/underwriting` package) in Tally's backend — the UI says so explicitly rather than implying the click invoked CRE.

---

## Automated tests

```bash
# Unit tests — pure logic, no network
pnpm --filter "@tally/*" test          # 26 tests across seam/underwriting/scheduler
cd apps/console && npx vitest run      # 7 tests, explorer links + proof entries

# Contract tests
cd contracts && forge test

# End-to-end — drives the real UI and real API routes in a real browser
cd apps/console && npx playwright test # 5 tests
```

The e2e suite registers a real business, asserts it's honestly declined, checks the explorer links, and **deletes exactly the rows it created** afterwards so the dashboard isn't polluted.

```bash
# Typecheck everything
pnpm -r --filter "@tally/*" typecheck
cd apps/console && npx tsc --noEmit
```
