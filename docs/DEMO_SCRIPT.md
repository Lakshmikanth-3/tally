# Demo script

A walkthrough of Tally's real, working flow — registration through
settlement — for recording or live presentation. Every step below is real:
real database, real Stripe OAuth (or disclosed synthetic data), real Hedera
testnet transactions. Nothing in this script is simulated except where
explicitly marked.

Run `pnpm --filter console dev` from the repo root and open `http://localhost:3000`.

## 1. The pitch (30s, talking over the home page)

> "A shop's real revenue becomes a short bond. Underwritten in private,
> priced in public, settles itself."

Show the home page. One sentence on the three sponsors: Hedera issues and
settles the bond, Chainlink privately underwrites it, The Graph makes every
issuer's repayment history public and queryable.

## 2. Register a business (30s)

Click "Register your business", enter a name, submit. Point out: this
creates a real row in the console's database and lands on that business's
own page — no fixture, no seeded state.

## 3. Show the revenue source (30s)

On the business page: "Connect Stripe" starts a real Stripe Connect OAuth
handshake — for a business with a real connected account, revenue below is
a live pull from Stripe's `charges.list`, not manually entered.

**For the recorded demo**, switch to `Corrado's Deli`
(`issuer-corrados-deli-f5bb20`) instead — it carries the same real
underwriting and issuance pipeline, but its revenue is clearly disclosed
synthetic demo data (visible **"Synthetic demo data — not a real business"**
badge on the page) rather than a real business's real multi-month sales
history. Say this out loud on camera: "this business's revenue numbers are
synthetic and disclosed as such — everything downstream of this number runs
exactly the same as it would for a real connected Stripe account."

## 4. Underwriting & bond issuance (60–90s, real wait)

Click "Run underwriting & issue bond". Narrate while it runs (~15–30
real seconds):

1. The console computes a real trailing-90-day revenue snapshot and
   volatility score from that business's actual transaction history.
2. **[Live deploy]** That snapshot would normally be read by the Chainlink
   CRE confidential workflow, inside a TEE, which applies the real pricing
   policy and returns only a verdict. **[If CRE deploy access hasn't been
   granted yet]** show `cre workflow simulate --target staging-settings
   --non-interactive --trigger-index 0` running the identical real logic
   locally instead, and say so plainly: "this is CRE's own simulator, not a
   live TEE deploy — the underwriting logic is identical either way, we're
   just waiting on Chainlink's private-beta access review to run it live."
3. On approval, the console drives a real headless-browser signer that
   issues a real fixed-rate bond through Hedera's Asset Tokenization Studio
   Factory contract on testnet — a real `Bond.create` + `FixedRate.setRate`,
   with the coupon rate frozen from the verdict.

When it completes, point at the rendered result: real bond token ID, real
EVM diamond address, real issuance transaction — each a live HashScan link.
Click one open on camera.

## 5. No-keeper settlement (pre-recorded segment)

This can't be rehearsed live end-to-end in a short demo (a coupon/maturity
schedule takes real wall-clock time to fire), so show a **pre-recorded,
already-completed** example instead — narrate it as real, not staged:

- A real coupon payment was armed as a Hedera `ScheduleCreateTransaction`
  with `setWaitForExpiry(true)` and, with zero keeper or cron job running,
  executed itself automatically at expiry.
- Pull up that schedule on HashScan and the mirror node's consensus
  timestamp for the resulting transfer, showing the on-time/late
  determination is computed from that real timestamp, never hand-set.
- Same pattern for redemption at maturity: role grants, control-list
  addition, a real self-signed KYC verifiable credential, then
  `Bond.fullRedeemAtMaturity` actually redeeming the bond.

## 6. The public performance register (30s)

Open the subgraph's Studio query playground
(https://thegraph.com/studio/subgraph/tally-register) and paste this
(verified live before recording — don't type it from memory on camera):

```graphql
{
  lifecycleEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
    kind
    timestamp
    onTime
    hcsTxId
    bond { issuer }
  }
  issuerStandings {
    id
    bondsIssued
    couponsOnTime
    couponsLate
  }
}
```

Point out this is querying a real deployed subgraph indexing real anchored
on-chain events (mirrored onto Sepolia for indexing — see
`FEEDBACK/THEGRAPH.md` for why) — this is the "priced in public" half of the
pitch: any future lender can see an issuer's real on-time repayment history
before extending credit again.

## 7. Close (15s)

> "Every number on this screen is real — real revenue, real Hedera
> transactions, real Scheduled Transaction settlement, real subgraph
> queries. The one disclosed exception is Corrado's Deli's synthetic demo
> revenue, and even that runs through the exact same real pipeline as a
> live Stripe-connected business."

## Rehearsal notes

- Rehearse steps 1–4 live at least twice before recording — step 4's real
  ~15–30s wait is the one place timing can surprise you on camera.
- Have the pre-recorded segment (step 5) and subgraph query (step 6) cued up
  and ready to switch to, rather than narrating the wait live.
- Decide before recording whether CRE deploy access has come through — if
  not, say so plainly on camera exactly once (per step 4) and move on; don't
  over-apologize for it.
