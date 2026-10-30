# Tally — Legal and Regulatory Design

**For:** lawyers, compliance professionals and regulators reviewing Tally for
the BLI Legal Tech Hackathon 2.

> **Status and disclaimer.** Tally is a **testnet technical prototype**. It is
> not an offer of securities, not a regulated financial service, and has no
> regulatory approval, registration or exemption of any kind. Nothing here is
> legal advice. Every bond described below exists only on Hedera **testnet**
> and Ethereum **Sepolia**, which carry no monetary value. Where this document
> describes a control, it says whether the control is **enforced on-chain
> today**, **implemented but limited**, or **not built**.

---

## 1. The problem

A small business with steady card revenue often cannot borrow against that
revenue. It has no audited accounts and little credit-bureau history, and
banks underwrite small loans at a cost that rarely justifies the ticket size.
Revenue-based financing (RBF) and merchant cash advances fill some of that gap,
but in practice they are:

- **opaque**: the borrower rarely sees the decision rule that priced them;
- **data-hungry**: the lender typically takes ongoing access to the
  business's full bank or payment-processor data, far more than the credit
  decision needs;
- **non-portable**: a good repayment record stays inside one lender's
  database and does not follow the business to its next financing.

Tally's thesis: a short-term debt instrument can be priced from a few facts
derived from verified revenue, issued as a transfer-restricted security token,
serviced automatically, and leave a public repayment record. All of this can
happen without publishing the business's financials.

## 2. How the instrument works

| Step | What happens | Where it is enforced |
|---|---|---|
| Registration | A business registers and connects its Stripe account via Stripe Connect OAuth (read access to its charges). | Tally console (off-chain) |
| Revenue snapshot | Charges are reduced to three numbers: trailing 90-day revenue, days of history, a daily-volatility score. Duplicate charges are rejected by a database uniqueness constraint on the Stripe charge ID. | Tally console + Postgres |
| Underwriting | A deterministic, published policy (`packages/underwriting/src/pricing.ts`): ≥30 days history, ≥$3,000 90-day revenue, volatility ≤40. Coupon = 4.00% + 0.04% per volatility point above 10. | Chainlink CRE workflow (DON consensus); the verdict is written to `UnderwritingRegistry` on Sepolia |
| Issuance | An approved business gets a fixed-rate bond on Hedera's Asset Tokenization Studio (ATS), with the verdict's coupon rate. | Hedera testnet (ATS bond contract) |
| Holding & transfer | Units can only be held by, or transferred to, accounts with KYC status *granted* on that bond that are also on its control list. | **ATS token contract, on-chain** |
| Coupons | Each coupon is a Hedera Scheduled Transaction that the network executes by itself at its due time. On-time/late is derived from Hedera consensus timestamps. | Hedera network |
| Record | Each confirmed lifecycle event is anchored to `SettlementAnchor` and indexed by a Graph subgraph. | Hedera / Sepolia + The Graph |
| Redemption | `fullRedeemAtMaturity` is implemented but **does not currently work** (see §8). | n/a |

## 3. Securities characterization

Tally's bond is designed and labelled as a **debt security**: a fixed principal
amount, a fixed coupon rate, a maturity date, and units sold to investors who
expect a return from the issuer's efforts. In the United States that is very
likely a "note" and a security (the *Reves* "family resemblance" test points
that way for an investment-motivated, broadly offered note). Comparable
analyses apply under India's Securities Contracts (Regulation) Act 1956 and
under MiCA's carve-out of financial instruments to MiFID II in the EU. Tally
does **not** try to design around securities law. Instead it uses
infrastructure built for regulated securities:

**Enforced on-chain today**

- **Permissioned security token.** Bonds are issued through Hedera's Asset
  Tokenization Studio, which implements an ERC-1400/ERC-3643-style security
  token, not a freely transferable ERC-20. Bonds are created with
  `internalKycActivated: true` (`packages/ats-client/src/issue.ts`).
- **KYC gate on every transfer.** The token contract checks each recipient's
  KYC status, and its control list, inside the transfer function itself.
  This is the equivalent of `require(hasKYC(recipient))`, but it is enforced
  by the token, not by Tally's interface. **Demonstrated live:** a second,
  independent testnet account (`0.0.10481844`) that was never granted KYC on
  the bond was refused by the ATS token with
  `transfer restricted: counterparty not compliant`, on the same order that a
  KYC'd account then filled successfully (DEMO.md §4). Tally's
  `SecondaryMarket` contract deliberately **does not** pre-check the buyer, so
  the rejection proves the token's own enforcement, not a UI check that could
  be bypassed.
- **Role separation.** ATS roles are granted separately per bond
  (`packages/ats-client/src/roles.ts`): *issuer*, *rate manager*
  (`FixedRate.setRate`), *control-list manager* (whitelist), *KYC / SSI
  manager*, and *maturity redeemer*. In a production deployment these would be
  held by different legal persons, such as an issuer, a transfer agent and a
  paying agent.

**Implemented but limited**

- **KYC credentials are self-issued in this prototype.** KYC is granted by a
  real W3C-style verifiable credential (`@terminal3/ecdsa_vc`), checked by
  ATS's real verifier and anchored to public revocation and DID registries on
  Hedera testnet (`packages/ats-client/src/kyc.ts`). **However, the credential
  is signed by Tally's own custodian key.** No identity verification of a
  natural person or legal entity takes place. The *mechanism* is the one a
  real KYC provider would plug into. The *assurance* is zero. An on-chain
  allowlist or a self-signed credential is **not** KYC/AML compliance.

**Not built**

- AML/sanctions screening, investor accreditation or suitability checks,
  holding-period (lock-up) rules, jurisdiction-based transfer restrictions,
  and a forced-transfer or recovery procedure for lost keys or court orders.
  ATS has primitives for some of these. Tally does not configure them.

## 4. Data privacy and confidentiality

The design follows **data minimisation**: personal data must be "adequate,
relevant and limited to what is necessary" (GDPR Art. 5(1)(c)). India's
Digital Personal Data Protection Act 2023 has a similar rule, limiting
processing to the data necessary for the specified purpose (s. 6(1)). A
business's revenue is also commercially sensitive, and for sole traders it is
personal data. Its confidentiality matters for trade-secret protection, which
depends on reasonable secrecy measures.

**What is visible where, today:**

| Data | Tally console / database | Chainlink DON | On-chain (Sepolia, Hedera) | Subgraph (public) |
|---|---|---|---|---|
| Individual transactions (amount, time, Stripe charge ID) | **Stored** | No | No | No |
| Stripe OAuth access token | **Stored (plaintext; see §8)** | No | No | No |
| Business name | Stored | No | No | No |
| 90-day revenue total, volatility, history days | Computed on request | **Received** (see below) | No | No |
| Verdict: approved, coupon bps, reason code | Stored | Produced | **Public** (`UnderwritingRegistry`) | Not yet indexed |
| Bond terms, holders' addresses, transfers | Stored | No | **Public** (ATS) | Partially |
| Coupon payments and on-time status | Stored | No | **Public** (Hedera + `SettlementAnchor`) | Yes, from the Sepolia deployment |

Key points, stated precisely:

- **Raw revenue never goes on-chain.** The on-chain verdict contains only
  `(issuerId, approved, couponBps, reasonCode)`. Revenue cannot be
  reconstructed from it.
- **Investor and holder PII is not on the ledger.** KYC status is recorded
  on-chain as a status flag linked to an account address and a credential
  reference. The identity documents behind a credential would stay with the
  credential issuer. This is the main privacy benefit of verifiable
  credentials over putting identity data on-chain.
- **The Chainlink confidential enclave (TEE) is not operating.** The workflow
  is written to run inside a TEE (`cre.handlerInTee`), so that Chainlink node
  operators could not see the three aggregate figures. On Chainlink's network
  the confidential-workflows capability currently fails with
  `cannot validate enclave config: DON members not set` (Chainlink-side
  provisioning, documented in `cre/tally-cre/README.md`). **Until that is
  resolved, the three aggregate figures are visible to the Workflow DON's node
  operators.** Tally does not claim confidential computation today.
- **Tally, as operator, holds the raw data.** Data minimisation is applied to
  what leaves Tally, not to what Tally itself collects. A production operator
  would be a data controller (GDPR) or Data Fiduciary (DPDP Act). It would
  need a lawful basis or consent, a retention schedule, and data-subject
  rights handling, none of which is built.

## 5. Auditability and evidence

Tally aims to produce an **evidentiary trail that does not depend on trusting
Tally**:

1. **Underwriting verdict.** Each CRE run signs a report through DON consensus
   and writes it through Chainlink's forwarder to `UnderwritingRegistry` on
   Sepolia. The resulting `UnderwritingVerdict` event shows *which* verdict was
   produced *when*. It can be cross-checked against the published policy and
   the workflow source, because the workflow logic is public even when its
   inputs are confidential.
2. **Issuance.** Bond creation, rate setting, role grants, KYC grants and
   minting are Hedera transactions, visible on HashScan and the Hedera mirror
   node.
3. **Payment.** Coupons are executed by the Hedera network itself. Payment
   time is the network's **consensus timestamp**, which neither Tally nor the
   issuer can backdate. Tally derives on-time/late status from that timestamp
   and never sets it by hand.
4. **Anchoring.** Only after a payment is confirmed on the mirror node does
   Tally anchor a `LifecycleEvent` to `SettlementAnchor` (confirm-then-anchor;
   never speculative).
5. **Public performance register.** A Graph subgraph indexes those events into
   per-issuer standings (bonds issued, coupons on time, late, redeemed).
   *Limitation:* Subgraph Studio cannot index Hedera, so the subgraph indexes
   a Sepolia copy of `SettlementAnchor`. The live Hedera anchors are therefore
   not yet in the subgraph (DEMO.md §6).

**Why this matters legally:** in a dispute over a missed coupon, both parties
can point to the same consensus-timestamped record of what was paid and when.
A regulator can check that an issuance followed a published rule, and a
future lender can verify repayment history without asking the previous lender.
This is evidence, not a legal conclusion. Its weight would depend on the
applicable rules of evidence. Some jurisdictions now admit blockchain records
expressly, for example Vermont (12 V.S.A. § 1913). In India, electronic records
are admissible under s. 63 of the Bharatiya Sakshya Adhiniyam 2023 with a
certificate.

## 6. Investor protection and disclosure

- **Synthetic data is labelled.** Two demo businesses, "Corrado's Deli" and
  "Lifecycle Demo Co", use synthetic revenue. They are flagged `is_demo` in the
  database, and every screen showing their revenue displays "Synthetic demo
  data — not a real business."
- **Declines are explained.** Every decision carries a machine-readable reason
  code: `0` approved, `1` revenue below threshold, `2` insufficient history,
  `3` volatility too high, `4` open default. These codes are written on-chain
  with the verdict. This supports adverse-action-style explanations, such as
  those under the US Equal Credit Opportunity Act / Regulation B where they
  apply.
- **Payment status is objective.** On-time/late comes from consensus
  timestamps, not from issuer self-reporting.
- **Not built:** offering memorandum, risk factors, investor
  acknowledgements, a cooling-off period, or complaint handling.

## 7. Open legal questions

These are genuine open questions. Tally does not resolve them.

1. **Jurisdiction and exemptions.** Which law governs an issuance whose
   issuer, investors and validating nodes are in different countries? In the
   US, a public offering would need registration or an exemption: Reg D
   506(b)/(c) for accredited investors, Reg CF via a registered funding
   portal (up to $5M per 12 months), or Reg A+. In India, a public issue of
   debt securities falls under SEBI's Non-Convertible Securities regulations
   (2021). Tokenised debt on a public chain has no clear path there today, and
   the RBI has been cautious about crypto-assets.
2. **Issuer of record.** Is the issuer the small business, Tally, or a
   special-purpose vehicle per issuance? The answer affects disclosure
   liability, insolvency remoteness and who holds the ATS *issuer* role.
3. **Lending vs securities law.** Depending on structure, a revenue-backed
   advance may instead be regulated lending, or fall under commercial-finance
   disclosure laws (for example the California and New York commercial
   financing disclosure regimes). This applies especially when one investor
   holds the whole bond.
4. **Investor eligibility.** Accreditation, suitability and retail limits are
   not checked. The KYC flag only proves that "someone granted this address
   status *granted*."
5. **Default and enforcement.** If a coupon fails, what are the holders'
   remedies? There is no security interest over receivables, no trustee, no
   acceleration clause, and no collection process. The `Defaulted` event kind
   exists in `SettlementAnchor`, but no default procedure is implemented.
6. **Algorithmic decisions.** The underwriting verdict is fully automated.
   GDPR Art. 22 restricts decisions "based solely on automated processing"
   that significantly affect a data subject, which may apply to sole traders.
   Credit-discrimination law also applies to the inputs used. Tally's policy
   is deterministic and published, which helps explainability, but there is
   no human-review or appeal path.
7. **Smart-contract terms vs legal terms.** Where the coded terms and any
   legal agreement conflict, which prevails? Tally has no legal agreement at
   all yet.
8. **Custody.** Units are minted to Tally's custodian account. Holding client
   assets typically triggers custody or safeguarding regulation.

## 8. Known gaps (technical, with legal relevance)

- **Redemption does not work.** `Bond.fullRedeemAtMaturity` reverts on a
  matured bond (`packages/ats-client/src/redeem.ts`). Principal repayment is
  therefore not automated in this prototype, a material gap for any
  debt instrument.
- **Stripe access tokens are stored in plaintext** in the database. A
  production system would encrypt them at rest (KMS) or avoid storing
  long-lived tokens at all.
- **No per-user authentication.** Value-moving routes are restricted to
  local requests or an admin token (`apps/console/lib/api-guard.ts`), which is
  a deployment guard, not access control.
- **TEE not operating** (see §4).

## 9. What a production version would need

1. **Legal structure:** an SPV or trust per issuance, a note agreement or
   indenture, and a trustee or security agent holding a charge over the
   receivables.
2. **A registered transfer agent / registrar** holding the ATS control-list
   and KYC roles, so the on-chain register is the legal register of holders.
3. **A real KYC/AML provider** issuing the verifiable credentials, with
   sanctions screening and ongoing monitoring. The credential mechanism stays
   the same; only the issuer changes.
4. **An offering route:** registration or a specific exemption per
   jurisdiction, with offering documents, risk disclosures and investor
   eligibility checks.
5. **Data-protection compliance:** a privacy notice, a lawful basis or
   consent, retention limits, a DPIA, a data processing agreement with the
   CRE operator, and an operating TEE.
6. **Dispute resolution:** a governing-law and arbitration clause that names
   the on-chain record as the agreed evidence of payment.
7. **Working redemption and default procedures.**
