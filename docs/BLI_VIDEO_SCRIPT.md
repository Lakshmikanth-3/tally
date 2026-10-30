# Tally — BLI Legal Tech Hackathon 2 video script (≤ 3:00)

**Audience:** blockchain law firms and legal professionals. They care about
liability, enforceability and what an auditor can verify — not code elegance.

**Rules while recording**
- Everything on screen must be real. No mocked screens, no simulated
  transactions presented as live ones.
- Say the limitations out loud. Judges trust a submission that discloses more
  than one that overclaims.
- Have these tabs open beforehand: the console business page, `/proof`,
  HashScan for bond `0.0.10519251`, Sepolia Etherscan for the
  `UnderwritingRegistry` verdict tx, and a terminal.

---

## 0:00–0:20 — The problem (20s)

> "A shop with a year of steady card sales usually can't borrow against it.
> No audited accounts, no credit file. When they can borrow, the underwriting
> is opaque, the lender takes their entire payment history, and their good
> repayment record never follows them to the next lender.
>
> Revenue bonds are a huge real-world market. They can't move on-chain unless
> the token itself refuses to be held by someone who isn't allowed to hold it.
> That's the gap Tally fills."

*On screen:* the Tally landing page, then the register screen.

## 0:20–1:00 — Legal and privacy design (40s)

> "Tally treats this as what it is: a debt security. So it's issued through
> Hedera's Asset Tokenization Studio — a permissioned security token with KYC
> and a control list, not a free-floating ERC-20.
>
> Two things lawyers should notice.
>
> First, compliance is enforced by the token, not by my interface. My
> secondary-market contract deliberately doesn't pre-check the buyer. If the
> recipient isn't KYC'd, the ATS token reverts the transfer itself.
>
> Second, the business's financials never go on-chain. A Chainlink workflow
> reads the revenue over an authenticated API, applies the policy, and
> publishes only a verdict: approved, coupon rate, reason code. That's data
> minimisation — GDPR Article 5(1)(c), India's DPDP Act — and it protects the
> shop's numbers as a trade secret. KYC is a verifiable credential, so no
> identity documents touch the ledger either."

*On screen:* `docs/LEGAL_AND_REGULATORY.md` §3–4, then the architecture
diagram in `docs/ARCHITECTURE.md` showing the trust boundary.

## 1:00–2:30 — The live flow (90s)

**Register and revenue (0:15)**

> "Here's a registered business. This one is labelled 'synthetic demo data —
> not a real business' — I seeded its revenue, and the product says so on
> every screen. Everything downstream of that number is real."

*On screen:* the business page with the synthetic-data badge and revenue
breakdown.

**CRE verdict, on-chain (0:30)**

> "The underwriting runs as a Chainlink CRE workflow. It fetches the revenue
> with a secret released by Chainlink's Vault, applies the policy, reaches
> consensus across the DON, and then writes the signed verdict on-chain
> through Chainlink's forwarder into my UnderwritingRegistry contract on
> Sepolia.
>
> Here's the transaction. The event carries the issuer, approved, the coupon
> rate in basis points, and a reason code — and nothing else. You can read the
> contract and the workflow source and check the decision against the
> published policy.
>
> This issuer is declined. Reason code three: volatility too high. Its revenue
> scores a hundred against a policy ceiling of forty. That's the policy saying
> no, in public, with a machine-readable reason an auditor or a regulator can
> check against published rules — which is the whole point. I didn't pick an
> issuer that flatters the demo.
>
> One caveat I'll state plainly: this workflow is written to run inside a
> hardware enclave, but Chainlink's confidential capability isn't provisioned
> for my DON yet. The run is real. It is not confidential today."

*On screen:* terminal running `cre workflow simulate … --broadcast`, then the
Sepolia Etherscan page for the `UnderwritingVerdict` event.

> **Note before recording.** The live verdict for `issuer-corrados-deli-f5bb20`
> is a *decline* (reason 3, 760 bps) — see `docs/evidence/`. The narration
> above is written for that. If you instead point
> `cre/tally-cre/underwriting/config.staging.json` at an issuer whose
> volatility is under 40, re-run the broadcast and the verdict approves; then
> cut the "declined" paragraph and say the coupon rate it produced. Do not
> narrate an approval over a declining transaction.

**Bond issued with KYC (0:25)**

> "A passing verdict sets the coupon rate on a real bond on Hedera. Here's one
> already issued that way. Created, rate set, roles granted, a verifiable
> credential granting KYC, units minted. Here it is on HashScan.
>
> And here's the moment that matters legally: an independent testnet account
> with no KYC on this bond tries to take delivery — and the token refuses.
> 'Transfer restricted: counterparty not compliant.' That's the contract
> talking, not my UI."

*On screen:* HashScan for the bond contract, then the market page showing the
real rejection next to the successful fill.

**Coupons settle themselves (0:20)**

> "Each coupon is a Hedera Scheduled Transaction that waits for its due date.
> Hedera executed all three of these by itself — no keeper, no cron. Real HBAR
> to a separately funded bondholder account. On-time status comes from
> Hedera's own consensus timestamp, so neither I nor the issuer can backdate a
> payment. Then it's anchored on-chain, only after the mirror node confirms it
> actually happened."

*On screen:* the coupon schedule with schedule IDs and "✓ on time", then the
mirror-node curl output.

## 2:30–3:00 — Evidence and close (30s)

> "Everything I've shown is verifiable without trusting me: the proof page
> lists every contract, account and endpoint with public explorer links. Over
> a hundred tests, including twelve that check these on-chain claims directly
> against the mirror node, Sepolia and The Graph.
>
> What doesn't work: redemption at maturity reverts, and I've written up
> everything I ruled out rather than hiding it. The enclave isn't running. KYC
> credentials are self-signed, so the plumbing is real and the identity
> assurance is zero — a production version needs a licensed transfer agent, a
> real KYC provider and a legal wrapper per issuance. Those are in the legal
> doc, with the open questions on jurisdiction, exemptions and default
> remedies.
>
> Tally is the compliance rail that lets revenue-based financing move
> on-chain: KYC-gated holding, private underwriting, and a public repayment
> record. Testnet prototype — not an offer of securities."

*On screen:* `/proof`, then the README's limitations section.

---

### Timing crib

| Segment | Length | Running |
|---|---|---|
| Problem | 0:20 | 0:20 |
| Legal + privacy design | 0:40 | 1:00 |
| Register + revenue | 0:15 | 1:15 |
| CRE verdict on-chain | 0:30 | 1:45 |
| Bond + KYC rejection | 0:25 | 2:10 |
| Coupons self-execute | 0:20 | 2:30 |
| Evidence + close | 0:30 | 3:00 |

### Do not say

- "Confidential" or "private enclave" about the current CRE deployment.
- "KYC compliant" / "regulatory compliant" — say "KYC-gated" and "designed for
  compliance."
- "Redemption works."
- An approval, if the transaction on screen is a decline.
- Anything implying the demo businesses are real customers.
