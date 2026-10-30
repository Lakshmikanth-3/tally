# DoraHacks BUIDL submission — BLI Legal Tech Hackathon 2

Copy-paste source for the DoraHacks form. Fields marked **PENDING** must be
filled in before submitting.

---

## BUIDL name

**Tally: Compliant RWA & Revenue Bond Issuance**

## Tagline (≤ 80 chars)

`Verified small-business revenue becomes a KYC-gated, self-settling bond.`

(72 characters.)

## Tracks

- **Real World Assets (RWA)** — tokenization of real-world assets
- **LegalTech & RegTech** — KYC, data privacy, legal automation

## Short description (~130 words)

Small businesses with steady card revenue usually can't borrow against it: no
audited accounts, no credit file. Revenue-based financing fills part of that
gap, but it is opaque, takes far more data than the credit decision needs, and
leaves a repayment record that never follows the business to its next lender.

Tally turns verified revenue into a short-term tokenized bond. A Chainlink CRE
workflow reads the revenue through an authenticated API, applies a published
underwriting policy, reaches consensus across Chainlink's DON, and writes only
the verdict — approved, coupon rate, reason code — on-chain. That rate sets the
terms of a bond issued through Hedera's Asset Tokenization Studio, where the
token itself refuses transfers to accounts without KYC. Coupons are Hedera
Scheduled Transactions that execute themselves at their due dates, and
confirmed payments are anchored on-chain into a public repayment register.

Testnet prototype. Not an offer of securities.

## Full description

### The problem

A shop can have a year of steady card sales and still be unfundable. Banks
underwrite small tickets at a cost the ticket doesn't justify. Revenue-based
financing and merchant cash advances do lend against revenue, but in practice
they are opaque (the borrower never sees the rule that priced them),
data-hungry (the lender takes ongoing access to the full payment history, far
more than the decision needs), and non-portable (a good repayment record stays
locked in one lender's database).

Meanwhile, revenue bonds are an enormous real-world market that cannot move
on-chain as things stand. A debt security held by whoever happens to buy the
token is a compliance failure, not a product. Tokenizing real-world debt
requires the token to refuse ineligible holders by itself.

### Target users

Small businesses with verifiable card revenue but no bank credit history; and
investors who want short-dated, revenue-backed paper with an auditable
repayment record. In a production deployment, the operator would be an
arranger working with a licensed transfer agent.

### The solution

Tally is the compliance rail between TradFi revenue-based lending and on-chain
settlement. Three things make it different from a conventional RBF platform:

1. **The credit decision is not Tally's word.** It is produced by a Chainlink
   CRE workflow across a decentralized network, signed by DON consensus, and
   written on-chain. Anyone can check the verdict against the published policy
   and the workflow's public source.
2. **Eligibility is enforced by the asset, not the interface.** The ATS
   security token checks KYC status and control-list membership inside its own
   transfer function. Tally's secondary-market contract deliberately does not
   pre-check the buyer, so a rejection proves the token's enforcement rather
   than a UI check that could be bypassed.
3. **The business's financials stay private.** Only `(issuerId, approved,
   couponBps, reasonCode)` is published. Revenue cannot be reconstructed from
   it.

### How it works

1. **Register and connect revenue.** Stripe Connect OAuth reads the business's
   own charges; duplicate charges are rejected by a uniqueness constraint on
   the Stripe charge ID. Businesses may also submit transactions manually.
2. **Snapshot.** The history is reduced to three facts: trailing 90-day
   revenue, days of history, a daily-volatility score.
3. **Underwrite on Chainlink CRE.** The workflow fetches those three figures
   with a secret released by Chainlink's Vault, applies the policy (≥30 days
   history, ≥$3,000 90-day revenue, volatility ≤40; coupon = 4.00% + 0.04% per
   volatility point above 10), and crosses back to the DON with the verdict
   alone.
4. **Write the verdict on-chain.** `EVMClient.writeReport` delivers the signed
   report through Chainlink's Keystone forwarder to `UnderwritingRegistry` on
   Ethereum Sepolia, which stores the latest verdict per issuer and emits
   `UnderwritingVerdict`.
5. **Issue the bond.** An approved business gets a real fixed-rate bond on
   Hedera's Asset Tokenization Studio at that coupon rate — created, rate set,
   roles granted, KYC granted by verifiable credential, units minted.
6. **Gate holding and transfer.** Every transfer checks the recipient's
   on-chain KYC status and control-list membership. Unverified recipients are
   reverted.
7. **Settle automatically.** Each coupon is a Hedera Scheduled Transaction
   with `setWaitForExpiry(true)`. The network executes it at its due time with
   no keeper. On-time status is derived from Hedera's consensus timestamp.
8. **Anchor and publish.** Only after the mirror node confirms a payment does
   Tally anchor a lifecycle event to `SettlementAnchor`. A Graph subgraph
   indexes those events into a per-issuer public repayment register.

### Legal and regulatory relevance

Full analysis: [`docs/LEGAL_AND_REGULATORY.md`](LEGAL_AND_REGULATORY.md).

- **The instrument is treated as a debt security** — fixed principal, fixed
  coupon, maturity — and issued on infrastructure built for regulated
  securities (an ERC-3643-style permissioned token), not designed around
  securities law.
- **KYC gating is on-chain and demonstrated.** An independent testnet account
  with no KYC was refused by the token itself (`transfer restricted:
  counterparty not compliant`) on the same order a KYC'd account then filled
  successfully.
- **Verifiable credentials keep PII off the ledger.** KYC is granted by a real
  ECDSA verifiable credential verified by ATS's own verifier and anchored to
  public DID and revocation registries; only a status flag reaches the chain.
- **Data minimisation by construction**, mapping to GDPR Art. 5(1)(c) and
  India's DPDP Act 2023, and protecting the business's figures as a trade
  secret.
- **Role separation** across issuer, rate manager, control-list manager,
  KYC/SSI manager and maturity redeemer — the shape a transfer agent and
  paying agent would occupy.
- **An evidentiary trail that does not require trusting the operator:**
  consensus-signed verdicts on-chain, payment times taken from Hedera
  consensus timestamps that no party can backdate, confirm-then-anchor
  lifecycle events, and a public repayment register.
- **Reason codes for declines** (`1` revenue below threshold, `2` insufficient
  history, `3` volatility too high, `4` open default) are published with the
  verdict, supporting adverse-action-style explanations.
- **Open questions are stated, not papered over:** jurisdiction and offering
  exemptions, issuer of record, investor accreditation, default and
  enforcement remedies, custody, and the status of a fully automated credit
  decision under GDPR Art. 22.

### Architecture

Diagrams, trust boundaries and the KYC-credential flow:
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md).

```
Business → Stripe Connect → Tally revenue API
   → Chainlink CRE workflow (policy, DON consensus)
   → UnderwritingRegistry (Ethereum Sepolia)       ← verdict only
   → Hedera ATS bond (KYC + control list)
   → Hedera Scheduled Transactions (coupons self-execute)
   → SettlementAnchor (confirm, then anchor)
   → The Graph (public repayment register)
```

### Security and privacy

- Money is a 6-decimal fixed-point `bigint` end to end; never a float.
- The revenue endpoint compares bearer tokens in constant time.
- Value-moving routes are refused when a request arrives through a proxy or
  tunnel without an admin token; the hosted deployment refuses them outright,
  so the custodian key never reaches a serverless function.
- `UnderwritingRegistry.onReport` accepts calls only from the configured
  Keystone forwarder, and advertises `IReceiver` through ERC165.

### Demonstrated functionality

- A real 3-coupon bond (`0.0.10519251`) whose coupons Hedera executed
  unattended at their due timestamps, paying real HBAR to a separately funded
  bondholder account, each anchored after mirror-node confirmation.
- A real secondary-market fill and a real on-chain compliance rejection.
- A CRE workflow deployed and executing on Chainlink's DON
  (`tally-underwriting-staging`), reporting `SUCCESS` with real consensus and
  a signed report, with Chainlink's nodes verified hitting the revenue
  endpoint.
- Tests passing locally today: 26 unit (shared packages), 18 console unit (3
  database tests skipped without a database), 17 Foundry contract tests, 9 CRE
  workflow tests. A further 20 API, 9 browser and 12 live-proof tests run
  against a running console.

### Current limitations (stated plainly)

1. **The Chainlink TEE enclave is not operating.** The workflow is written for
   a TEE, but the confidential-workflows capability fails with `cannot validate
   enclave config: DON members not set` — Chainlink-side provisioning. Runs are
   real but **not confidential**.
2. **Redemption at maturity does not work.** `fullRedeemAtMaturity` reverts
   with empty revert data on a genuinely matured bond, with every documented
   precondition confirmed satisfied on-chain. Everything ruled out is written
   up in `packages/ats-client/src/redeem.ts`.
3. **KYC credentials are self-signed** by Tally's custodian key. No identity
   verification of any person or entity occurs. The mechanism is real; the
   assurance is zero. An on-chain allowlist is not KYC/AML compliance.
4. **Two demo businesses use synthetic revenue**, flagged in the database and
   labelled on every screen that shows their figures.
5. **The subgraph indexes a Sepolia copy** of `SettlementAnchor`, because
   Subgraph Studio cannot index Hedera — so live Hedera anchors do not appear
   in it yet.
6. **No per-user authentication**; value-moving routes are local-only by
   design.
7. **Stripe access tokens are stored in plaintext** in the database.

### Roadmap

Working redemption; an operating TEE so underwriting is genuinely
confidential; a real KYC provider issuing the credentials; indexing the Hedera
deployment directly; encrypted token storage and per-user auth; and the legal
wrapper a real issuance needs — SPV per issuance, a licensed transfer agent,
offering documents, and a dispute-resolution clause naming the on-chain record
as agreed evidence of payment.

## Technology stack

Next.js 15 · TypeScript · PostgreSQL (Neon) · Stripe Connect · Chainlink CRE
(TypeScript SDK, Vault secrets, DON consensus, `EVMClient.writeReport`) ·
Hedera Asset Tokenization Studio · Hedera Scheduled Transactions · Hedera
Mirror Node · Solidity + Foundry · The Graph · Playwright (both for browser
tests and as the ATS signing environment) · Vitest · pnpm + Turborepo ·
`@terminal3/ecdsa_vc` verifiable credentials · viem · ethers.

## Sponsor integrations

### Chainlink — CRE ("Best workflow with CRE")

The CRE workflow is Tally's **orchestration layer**: it is what turns revenue
into a credit decision and puts that decision on-chain, where the bond's terms
come from.

| Requirement | Evidence |
|---|---|
| 1. Build, simulate or deploy a CRE Workflow used as an orchestration layer | `cre/tally-cre/underwriting/workflow.ts` — fetches revenue, applies the policy, reaches DON consensus, writes the verdict that sets the coupon rate. Deployed live as `tally-underwriting-staging` on Chainlink's private registry; 9 workflow tests pass. |
| 2. Integrate at least one blockchain with an external API / data source | **External API:** Tally's revenue endpoint, called from the workflow with a Vault-released bearer secret — Chainlink's nodes verified hitting it (`User-Agent: Go-http-client/1.1`, HTTP 200). **Blockchain:** `EVMClient.writeReport` → `UnderwritingRegistry` on Ethereum Sepolia (`contracts/src/UnderwritingRegistry.sol`, 9 Foundry tests). Registry address: [`0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c`](https://sepolia.etherscan.io/address/0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c) |
| 3. Successful CRE CLI simulation or live CRE deployment | **Live deployment:** execution `SUCCESS` with real consensus and a signed report. **Simulation with broadcast:** `cre workflow simulate underwriting --target staging-settings --broadcast` → log at `docs/evidence/cre-simulation.log`, Sepolia verdict tx [`0xa58ea689…f4e085`](https://sepolia.etherscan.io/tx/0xa58ea689f0b8f3f4cfbcb1f71ca5ccb241a80f0da734d880a1a09fcf94f4e085). The stored verdict is read back from the contract in `docs/evidence/onchain-verification.txt` — the tx receipt alone does not prove the write landed. |

Bounty use case fit: **tokenized asset servicing and lifecycle management**
(the verdict sets and records the bond's coupon terms) and **automated risk
monitoring** (the workflow re-underwrites on a cron schedule).

**Caveat:** the enclave is not provisioned, so this deployment is not
confidential. See limitation 1.

### Hedera

- **Asset Tokenization Studio** issues a genuine fixed-rate bond — creation,
  `FixedRate.setRate`, role grants, KYC by verifiable credential, and minting
  via `Security.issue` — and provides the compliance gate: KYC, control lists
  and transfer restrictions enforced inside the token.
- **Scheduled Transactions** are the whole settlement engine. Hedera refuses
  schedules more than ~60 days out, so the full coupon calendar is stored at
  issuance and armed progressively.
- **Mirror Node** is the source of truth for on-time status and for rebuilding
  the secondary-market order book from event logs.

### The Graph

A subgraph indexes `LifecycleEvent`s into per-issuer standings — bonds issued,
coupons on time, coupons late, redemptions — so repayment history becomes a
public, queryable credit record. Studio cannot index Hedera, so the same
contracts are deployed to Sepolia and that copy is indexed.

## Demo and verification links

| Item | Link |
|---|---|
| GitHub repository (public, MIT) | https://github.com/Lakshmikanth-3/Tally |
| Live application | https://tally-eight-jet.vercel.app/ |
| Demo video (2–3 min) | **PENDING — not yet recorded** (script: `docs/BLI_VIDEO_SCRIPT.md`) |
| Architecture documentation | `docs/ARCHITECTURE.md` |
| Legal and regulatory analysis | `docs/LEGAL_AND_REGULATORY.md` |
| Guided walkthrough with verification commands | `DEMO.md` |
| `UnderwritingRegistry` (Ethereum Sepolia) | [`0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c`](https://sepolia.etherscan.io/address/0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c) |
| `SettlementAnchor` | `0.0.10501789` (Hedera) / `0xFa5FE1d6…` (Sepolia) |
| `SecondaryMarket` | `0.0.10501801` (Hedera) / `0x3d56CC4e…` (Sepolia) |
| Bond with self-executing coupons | Hedera contract `0.0.10519251` |
| CRE simulation log + verdict tx | `docs/evidence/cre-simulation.log` · [`0xa58ea689…f4e085`](https://sepolia.etherscan.io/tx/0xa58ea689f0b8f3f4cfbcb1f71ca5ccb241a80f0da734d880a1a09fcf94f4e085) |
| CRE workflow ID | **PENDING** (`cre workflow list --registry private`) |
| Subgraph | https://thegraph.com/studio/subgraph/tally-register |
| Test results | `pnpm test`, `cd contracts && forge test`, `cd cre/tally-cre/underwriting && bun test` |

## Team

**Lakshmikanth** — sole submitter; design, engineering and documentation.

Narayanan D appears in the git history as a contributor to the pre-existing
ETHOnline 2026 codebase (2 of 93 commits).

## Previous work disclosure

Tally was originally built for **ETHOnline 2026**. That is stated in the
README and is not concealed. Pre-existing: the console, Stripe integration,
underwriting policy, Hedera ATS issuance, scheduled-transaction settlement,
`SettlementAnchor`, `SecondaryMarket`, the subgraph, and the CRE workflow up to
`donRuntime.report(...)`.

Built for this hackathon: the `UnderwritingRegistry` contract and its tests,
the on-chain verdict write in the CRE workflow, rewritten workflow tests, the
legal and regulatory analysis, the architecture documentation, this submission
text, the video script, and the MIT license file. Confirm that the hackathon's
rules permit a previously built project before submitting.
