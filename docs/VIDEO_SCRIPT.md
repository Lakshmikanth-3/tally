# Tally — demo video script

**Length:** about 4 minutes. **Format:** screen recording with voice-over.
Every line you say is written out below. Read it naturally; you don't have to
match it word for word, but don't add claims that aren't in it.

**The one rule for this video:** only say what the screen is showing. Every
claim here is checked by the test suites in *Before you record*, so if those
pass, everything you say is true.

---

## Before you record (15 minutes, once)

### 1. Check every claim is still true

```bash
cd apps/console
pnpm test:proof      # on-chain facts: bond, coupons, contracts, subgraph
```

Expect **11 passed**. One test, *"the register contains indexed lifecycle
events"*, currently **fails**: The Graph is deployed and healthy, but no
settlement events have been written to the Sepolia contract it indexes (see
Scene 7). Do not show a populated register until that test passes.

### 2. Prepare a business that can issue a bond live

Both existing demo businesses already hold an outstanding bond, and Tally
blocks a second bond until the first is redeemed. So create a fresh one:

```bash
cd apps/console
pnpm dev                                  # http://localhost:3000, leave running

# In a second terminal — register it (or use the "Add a business" page):
curl -s -X POST http://localhost:3000/api/business/register \
  -H 'content-type: application/json' -d '{"name":"Harbor Coffee"}'
# → copy the issuerId it returns, e.g. issuer-harbor-coffee-1a2b3c

# Give it 95 days of clearly-labelled synthetic revenue:
npx tsx --env-file=.env.local scripts/seed-demo-business.ts issuer-harbor-coffee-1a2b3c
```

Open `http://localhost:3000/business/<that issuerId>` once and check it shows
the **"Synthetic demo data — not a real business"** badge and roughly
**$14,000** trailing 90-day revenue. **Don't click "Run underwriting" yet** —
that happens on camera.

### 3. Open these tabs, in this order

1. `http://localhost:3000/`
2. `http://localhost:3000/business/<your new issuerId>`
3. `http://localhost:3000/business/issuer-lifecycle-demo-co-c89705`
4. `https://hashscan.io/testnet/schedule/0.0.10519300`
5. `http://localhost:3000/market`
6. A terminal in `cre/tally-cre`, with `cre execution list tally-underwriting-staging` typed but not run
7. `http://localhost:3000/proof`

### 4. Recording setup

- Browser zoom 110–125% so text is readable on a small player.
- Hide bookmarks, close unrelated tabs, silence notifications.
- Rehearse Scene 3 once with a *different* throwaway business so you know how
  long issuance takes (usually 20–40 seconds). You can cut the wait in editing.

---

## Scene 1 — The problem and the idea (0:00–0:30)

**Screen:** Tab 1, the home page. Let the coin animation play. Scroll slowly
to the seven-step pipeline.

**Say:**

> "Small businesses often have steady card revenue but no credit history, so
> banks can't lend to them — and when they do, underwriting is manual,
> one-off and opaque.
>
> Tally turns a shop's real revenue into a short-term bond. It's underwritten
> in private, priced in public, and it pays itself back.
>
> Three sponsor technologies do the heavy lifting: Chainlink reads the revenue
> and decides the rate, Hedera issues the bond and runs the payments, and The
> Graph makes every issuer's repayment record public."

---

## Scene 2 — A business and its revenue (0:30–1:05)

**Screen:** Tab 2, your new business. Point the cursor at the synthetic-data
badge, then at *Trailing 90-day revenue*.

**Say:**

> "This is a business registered on Tally. In production, revenue comes
> straight from the business's own Stripe account through Stripe Connect —
> Tally reads it; the shop never types a number in.
>
> For this demo I'm using synthetic revenue, and the app says so right here on
> the page. Everything that happens next — the underwriting, the bond, the
> on-chain transactions — is real, and runs exactly as it would for a real
> Stripe-connected shop.
>
> Tally reduces that history to three facts: ninety-day revenue, how many days
> of history there are, and how volatile the daily takings are."

---

## Scene 3 — Underwriting and issuing a real bond (1:05–2:00)

**Screen:** Still Tab 2. Click **Run underwriting & issue bond**. While it
runs, keep talking. When it finishes, point at **APPROVED**, the coupon rate,
and **✓ Issued on Hedera testnet**, then click the token link so HashScan opens.

**Say (while it runs):**

> "Now I'll run underwriting. The policy is simple and deterministic: at least
> thirty days of history, at least three thousand dollars in ninety-day
> revenue, and volatility under a cap. The coupon rate starts at four percent
> and rises with volatility.
>
> If it's approved, Tally issues a real fixed-rate bond through Hedera's Asset
> Tokenization Studio. That SDK only signs inside a web browser, so our server
> drives a real headless browser with Tally's custodian key to sign each
> transaction. That's what we're waiting on — a real, multi-transaction flow
> on Hedera testnet."

**Say (when it finishes):**

> "Approved, at this coupon rate. That's a real bond contract on Hedera
> testnet — here it is on HashScan, the public block explorer."

*(If issuance fails, say "that's a real network error, it's recorded in the
history" and switch to Tab 3 — its bond was issued the same way.)*

---

## Scene 4 — Coupons that pay themselves (2:00–2:45)

**Screen:** Tab 3, Lifecycle Demo Co. Scroll to its coupon schedule: three
coupons, each with a schedule ID and "✓ on time". Then switch to Tab 4,
HashScan's page for schedule `0.0.10519300`, and point at the executed time.

**Say:**

> "This bond was issued earlier with three coupon payments. Each one was set
> up as a Hedera Scheduled Transaction that waits for its due date.
>
> Nobody pressed a button when they came due. There's no bot and no cron job.
> The Hedera network itself executed each payment at its scheduled time and
> moved real HBAR to a separate bondholder account.
>
> Here's the first one on HashScan: created in advance, executed by the
> network on the due date. Tally then checked the network's own timestamp to
> record whether each payment was on time — that's never typed in by hand."

---

## Scene 5 — A secondary market with real compliance (2:45–3:15)

**Screen:** Tab 5, the market. Point at the order book.

**Say:**

> "Bonds can be resold. This order book is rebuilt from the market contract's
> own on-chain events, not a database.
>
> The bond token enforces compliance itself. When an account that wasn't
> KYC-approved tried to buy, the bond contract rejected the transfer on-chain —
> 'counterparty not compliant.' That rule lives in the token, not in our
> interface."

---

## Scene 6 — Chainlink runs the underwriting (3:15–3:40)

**Screen:** Tab 6. Run `cre execution list tally-underwriting-staging` and
point at the SUCCESS rows (it runs every minute). Copy the top execution ID
and run `cre execution logs <that id>`, then point at the nine
`Underwriting complete … approved=true bps=460` lines.

**Say:**

> "The same underwriting logic is deployed as a Chainlink CRE workflow, running
> live on Chainlink's network every minute. Each run fetches Corrado's Deli's
> revenue snapshot from Tally's API with a secret token, applies the policy,
> and reports only the verdict — never the raw revenue.
>
> Here's one run: nine independent Chainlink nodes each computed the same
> answer — approved, at four point six percent — and reached consensus.
>
> To be precise: these runs are real, but Chainlink hasn't finished
> provisioning the confidential enclave for our private-beta workflow yet, so
> today they run without the confidentiality guarantee."

---

## Scene 7 — Everything is checkable (3:40–4:05)

**Screen:** Tab 7, the Verify on-chain page. Scroll through the Hedera,
Sepolia and The Graph sections.

**Say:**

> "Every claim in this video is on this page with a public explorer link:
> the contracts on Hedera, a copy on Sepolia, and our subgraph on The Graph.
> We keep a Sepolia copy because The Graph's Studio can't index Hedera
> directly. Nothing here requires trusting our interface."

**Do not open the subgraph's query results on camera** while
`pnpm test:proof` still reports *"the register contains indexed lifecycle
events"* as failing — the subgraph is live, but its register is empty today.
When that test passes, add this line and show the query:

> "And here's the public register: every issuer's on-time payment record,
> queryable by any future lender."

---

## Scene 8 — Close (4:05–4:20)

**Screen:** Back to Tab 1.

**Say:**

> "Tally: real revenue becomes a real bond, underwritten by Chainlink, issued
> and paid on Hedera, with a public track record on The Graph. Thanks for
> watching."

---

## Don't say

- That redemption at maturity works. It doesn't yet — `Bond.fullRedeemAtMaturity`
  reverts on-chain; see DEMO.md, *Known issue: redemption*.
- That the Chainlink run is confidential or runs in a TEE today.
- That the demo businesses are real shops.
- "Fully decentralized" or "production-ready." Tally holds the custodian key.
