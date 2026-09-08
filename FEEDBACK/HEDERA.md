# Feedback: Hedera (Asset Tokenization Studio + testnet)

Tally uses Hedera's native testnet (deployed contracts, mirror node, Scheduled
Transactions) and the Asset Tokenization Studio (ATS) SDK v8.0.0 for real bond
issuance and redemption. Everything below is grounded in things we actually
hit building against it — not speculative.

## What worked well

- **Scheduled Transactions are a genuinely killer feature.** `ScheduleCreateTransaction`
  + `setWaitForExpiry(true)` gave us real, no-keeper coupon and redemption
  settlement — armed once, executes itself at expiry with zero bot/cron
  infrastructure. We verified this live multiple times (e.g. schedule
  `0.0.10411318` auto-executing exactly as armed). This is the single feature
  that made "coupons pay themselves" a real claim rather than marketing copy.
- The mirror node REST API is fast, reliable, and gave us everything needed
  to verify on-time vs. late settlement against real consensus timestamps.
- ATS's compliance model (control lists, internal KYC, roles) is real and
  strict once you understand it — which is a genuine strength for a
  bond-issuance product, once the friction below is worked through.

## Friction points (all real, all cost us debugging time)

1. **No documented backend-signing path.** The SDK gates every state-changing
   call behind `Injectable.isWeb()` (`!!global.window`), and once you get past
   that, `MetamaskService.init()` needs real browser APIs
   (`window.ethereum`, `window.addEventListener`, `detectEthereumProvider`).
   The only backend-signing options the SDK actually supports are three named
   custodial services (DFNS, Fireblocks, AWS KMS) — each a paid third-party
   signup. There's no documented "just sign with a raw private key from
   Node.js" path, which is a strange gap for a product where the platform
   itself is often the natural signer (as it is for us: Tally is the
   custodian, businesses never touch a wallet). We ended up building a real
   headless-Chromium signer (Playwright + a minimal injected EIP-1193
   provider) to drive the SDK inside an actual browser context — it works,
   but it's a lot of infrastructure to reach for just to sign transactions
   from a server.
2. **`Bond.createFixedRate` is broken in SDK 8.0.0.** It calls
   `factoryInstance["deployBondFixedRate"]`, but the real deployed Factory
   contract only exposes `deployBond` — every call throws `TypeError:
   factoryInstance[deployMethod] is not a function`. The real working path
   (`Bond.create` + a separate `FixedRate.setRate` call) exists in the SDK
   but isn't documented as the fix for this.
2. **Access-control requirements for follow-up calls aren't documented.**
   After `Bond.create`, the diamond owner does *not* automatically hold the
   roles needed to set a coupon rate (`_INTEREST_RATE_MANAGER_ROLE`), add an
   account to the control list (`_CONTROLLIST_ROLE`), or redeem at maturity
   (`_MATURITY_REDEEMER_ROLE`) — each has to be granted explicitly via
   `Role.grantRole`, and we only found out which role was missing by decoding
   the revert selector against the contracts package's own ABI JSON files
   one at a time.
3. **ISIN validation is inconsistent between the SDK and the contract.** The
   SDK's client-side `Security.checkISIN` only checks length/format; the
   deployed Factory contract separately validates the real ISO 6166 Luhn
   checksum and reverts with `WrongISINChecksum` if it doesn't match. A
   correctly-formatted, SDK-accepted ISIN can still fail on-chain.
4. **Type declarations don't always match runtime values.** `Bond.create`'s
   response is typed as `SecurityViewModel` with `diamondAddress: string`,
   but the real runtime value is a `HederaId`-shaped object
   (`{ value: string }`). Harmless if you only pass it back into other SDK
   calls (which happen to tolerate either shape), but it breaks any caller
   that actually trusts the declared type.
5. **KYC only has one real grant path, and it's heavier than it needs to be
   for a simple internal-KYC use case.** With `internalKycActivated: true`,
   we expected a lightweight "mark this account KYC'd" call. Instead,
   `Kyc.grantKyc` requires a real verifiable credential, verified via
   `@terminal3/verify_vc`. That package, in turn, unconditionally pulls in a
   BBS+ implementation (`@mattrglobal/node-bbs-signatures`) with no browser
   build at all — a real problem if you're driving the SDK from a browser
   context, since our ECDSA-only usage never touches that code path but still
   has to work around it at the bundler level to ship at all. `RegulationType.NONE`
   (no regulation) also has no valid subtype combination in the SDK's own
   validation logic — every subtype fails for that type, which reads as a
   real gap for anyone issuing a plain non-regulated testnet/demo bond.

## What we'd want improved

- A documented, first-class "sign with a raw key from a trusted backend"
  path, without requiring a paid custodial service or a real browser.
- The role requirements for `Bond.create`'s follow-up calls (rate-setting,
  control-list, redemption) listed explicitly in the docs, not discovered by
  decoding revert selectors.
- `Bond.createFixedRate` fixed or removed, since it's currently a dead,
  silently-broken code path.
- ISIN checksum validation surfaced client-side too, so it fails fast instead
  of after a real on-chain transaction.

None of this stopped us — every one of these was worked through to a real,
live-verified issuance and redemption on Hedera testnet — but each cost real
debugging time that documentation could have saved.
