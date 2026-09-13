# Tally — demo walkthrough

Every figure and link below is a real query against real testnet
infrastructure. Nothing here is a fixture, a mock, or a replayed recording.
Where something doesn't work, it says so.

Two disclosed exceptions, both visible in the product itself:

- **Demo businesses use synthetic revenue.** "Corrados Deli" and "Lifecycle
  Demo Co" are seeded with clearly-labelled synthetic transactions
  (`source='synthetic-demo'`), and every page that shows their revenue
  carries a "Synthetic demo data — not a real business" badge. The
  underwriting run over that revenue, and everything downstream of it, is
  real.
- **The Chainlink TEE enclave is not actually running** — see §5.

---

## 0. Run it

```bash
pnpm install          # builds the ATS browser-signer bundle via postinstall
cd apps/console && pnpm dev
```

Open http://localhost:3000. A real `.env` at the repo root is required
(see `.env.example`); the console loads it automatically.

---

## 1. The pitch, in one page

**http://localhost:3000/pitch**

Built from the app's own live data — the platform stats, the real bonds this
instance has issued, and the same verification links as `/proof`. No numbers
on that page are typed in.

---

## 2. A real bond, minted on Hedera

**http://localhost:3000/business/issuer-lifecycle-demo-co-c89705**

This is a real 3-coupon bond issued through Hedera's Asset Tokenization
Studio. Bond token **`0.0.10519251`** — open it on HashScan from the page.

Worth knowing: bond tokens here are **ATS diamond contracts, not native HTS
tokens**, so they live at `hashscan.io/testnet/contract/…`, not `/token/…`.
Checking the wrong page type returns "not found" and looks like a missing
token.

Verify the units genuinely exist:

```bash
# totalSupply == 1, held by the custodian
cast call 0x184e71e97f46c75950e8ec12d08e53da4b31ad3c "totalSupply()(uint256)" \
  --rpc-url https://testnet.hashio.io/api
```

Issuance previously deployed the bond but never minted anything — every bond
had a permanent `totalSupply()` of 0. That's fixed (`Security.issue`, plus
the role/whitelist/KYC gates it requires); this bond is the proof.

---

## 3. Coupons that pay themselves — the strongest result

On the same page, see **Coupon schedule**: three coupons, each with a real
Hedera schedule ID and "✓ on time".

What actually happened, unattended:

| # | Schedule | Due | Executed |
|---|---|---|---|
| 1 | `0.0.10519300` | 12:26:57 | `1789282617.052` |
| 2 | `0.0.10519301` | 12:35:17 | `1789283117.008` |
| 3 | `0.0.10519302` | 12:43:37 | `1789283617.045` |

Each is a real `ScheduleCreateTransaction` with `setWaitForExpiry(true)`.
**Hedera executed all three itself at its own consensus time — no keeper, no
cron, no bot.** Confirm one directly:

```bash
curl -s https://testnet.mirrornode.hedera.com/api/v1/schedules/0.0.10519300
# executed_timestamp is populated, matching the due date
```

Real HBAR moved to a real, separately-funded bondholder account
(`0.0.10481844`) — three scheduled receipts of exactly `0.12809615 ℏ`:

```bash
curl -s "https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=0.0.10481844&transactiontype=CRYPTOTRANSFER&order=desc&limit=10"
```

That account shows a **fourth**, larger scheduled receipt of `0.38428845 ℏ`
(= 3 × the coupon). It's real, and it's an artifact worth explaining rather
than hiding: multi-coupon support landed while this bond was live, and the
previous single-bullet code path — still loaded in the background sweep —
armed one whole-term coupon before the new code took effect. The current
code can't double-arm (it only arms coupons with no schedule ID, under a
unique constraint); this bond simply straddled the change.

A background sweep then confirmed each payment on the mirror node and only
then anchored a `Coupon` lifecycle event to the real `SettlementAnchor`
(`0.0.10501789`) — a successful `CONTRACTCALL`, with on-time status derived
from the network's own consensus timestamp, never hand-set.

> Coupons can't all be armed at issuance: Hedera refuses a schedule expiring
> more than ~60 days out. They're armed progressively as each due date comes
> into range.

---

## 4. A real secondary market, including a real rejection

**http://localhost:3000/market**

The order book is reconstructed from real on-chain event logs via the Hedera
Mirror Node — never a local cache.

Both outcomes the contract can produce were demonstrated against the *same*
escrowed order:

- **Successful fill** — Tally's custodian (whitelisted and KYC'd on that
  security) filled it; the unit moved contract → taker on-chain.
- **Real compliance rejection** — a second, genuinely independent testnet
  account (`0.0.10481844`), never granted KYC on that bond, was refused by
  the ATS token itself with
  `transfer restricted: counterparty not compliant`.

That rejection is the real ATS enforcement path, not a UI-side check.

A listing escrows the unit into the market contract first — ATS bond tokens
aren't plain ERC-20 (`approve`/`transferFrom` both revert), so escrow goes
through the SDK's own transfer with the same whitelist/KYC gates.

---

## 5. Chainlink CRE — deployed and executing live

```bash
cre workflow list --registry private
cre execution list tally-underwriting-staging
```

`tally-underwriting-staging` is **ACTIVE on Chainlink's real DON** and
executing on a cron trigger, reporting `SUCCESS`. It fetches the business's
real revenue from this console's API, applies the same underwriting policy
as `packages/underwriting`, and reports only the verdict — never the raw
revenue.

Verified from both ends: Chainlink's nodes hit the revenue endpoint
(`User-Agent: Go-http-client/1.1`) and received real revenue data.

> **Honest caveat.** The TEE enclave itself is **not** running. Even on a
> `SUCCESS` execution the `confidential-workflows` capability fails with
> `cannot validate enclave config: DON members not set` — Chainlink-side
> provisioning, not something fixable in this repo. The trigger, HTTP call,
> consensus and signed report are all genuine, but this deployment is **not
> confidential** and shouldn't be described as such.

---

## 6. Verify everything independently

**http://localhost:3000/proof** — every contract, account and endpoint, with
public explorer links. Nothing requires trusting this UI.

- `SettlementAnchor` — `0.0.10501789` (Hedera) / `0xFa5FE1d6…` (Sepolia)
- `SecondaryMarket` — `0.0.10501801` (Hedera) / `0x3d56CC4e…` (Sepolia)
- Subgraph — https://thegraph.com/studio/subgraph/tally-register (v0.0.2)

> The Sepolia copies exist **only** because Subgraph Studio can't index
> Hedera. That has a real consequence: settlement anchors are written to the
> Hedera deployment, so the subgraph — which reads Sepolia — will not show
> them. The per-bond "Lifecycle timeline" says so rather than implying
> nothing was anchored.

---

## 7. Tests

```bash
cd contracts && forge test     # 8 passing
cd apps/console && pnpm test   # 15 unit
pnpm test:e2e                  # 9 end-to-end, against a real running app
```

---

## Known issue: redemption

`Bond.fullRedeemAtMaturity` **reverts** on a genuinely matured bond. This is
the one part of the lifecycle that does not work.

Every precondition on the contract's own modifier list was confirmed
satisfied on-chain — maturity reached, redeemer role held, KYC granted,
whitelisted, units held — and it is not out of gas (234,093 used of a
239,030 limit). The identical calldata *simulates* fine via `eth_call`; it
only fails as a real transaction, reverting with empty revert data, so there
is no custom error to decode.

One real bug was found and fixed on the way: the SDK resolves a `0.0.x`
account id to that account's long-zero EVM address, which is neither
whitelisted nor the address actually holding the units, producing
`AccountIsBlocked`. Passing the ECDSA alias fixes that specific failure — a
different empty revert remains.

Everything ruled out is written up in `packages/ats-client/src/redeem.ts`.

---

## Security note

Routes that move real value (issuing, arming coupons, escrowing units,
filling orders) are refused when the request arrives through a proxy or
tunnel, unless it presents `TALLY_ADMIN_TOKEN`. This matters because running
the console behind a public tunnel — required so Chainlink's DON can reach
`/revenue` — would otherwise expose every one of them to anonymous callers;
the fill route would have signed with the custodian's own key.

This is a deployment-context guard, **not** authentication. A publicly
hosted version would need real per-user auth. See
`apps/console/lib/api-guard.ts`.
