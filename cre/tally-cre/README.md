# Tally Underwriting — Chainlink Confidential Workflow

Tally's real confidential underwriting workflow (`underwriting/`), built on Chainlink CRE's Confidential Workflows. It runs a handler's callback inside a secure enclave: fetches a business's real revenue snapshot from Tally's own console API (`apps/console`), applies Tally's real underwriting policy over that confidential data inside the enclave, then crosses back to the Workflow DON with only the verdict — never the raw revenue figures.

This started from Chainlink's "Hello Confidential Workflows" starter template; the sections below describe the real, customized workflow as it exists in this repository, not the generic template.

**⚠️ DISCLAIMER**

This template is an educational example to demonstrate how to interact with Chainlink systems, products, and services. It is provided **"AS IS"** and **"AS AVAILABLE"** without warranties of any kind, has **not** been audited, and may omit checks or error handling for clarity. **Do not use this code in production** without performing your own audits and applying best practices. Neither Chainlink Labs, the Chainlink Foundation, nor Chainlink node operators are responsible for unintended outputs generated due to errors in code.

**⚠️ PRIVATE BETA**

[Confidential Workflows](https://docs.chain.link/cre/concepts/confidential-workflows) is in **private beta** and requires enrollment through your Chainlink account team — see [Requesting Confidential Workflows Access](https://docs.chain.link/cre/account/confidential-workflows-access). 

---

## Overview

By default, a CRE workflow's callback runs on Workflow DON nodes, where node operators can in principle inspect the data it is computing over. That's fine for most workflows — but some logic needs to be computed over sensitive data while preserving the confidentiality of that data: risk thresholds, API credentials, centralised exchange stablecoin reserves for reasoning, identity details. Leaking this data could have adverse effects, including enabling front-running attacks, exposing sensitive financial information, and compromising individual privacy.

A **Confidential Workflow** moves that computation into a hardware-isolated [enclave](https://docs.chain.link/cre/key-terms#enclave). This template is the minimal end-to-end shape of one, in four steps:

| Step | What it demonstrates | API |
|------|----------------------|-----|
| 1 | Registers a TEE handler to execute in the enclave | `cre.handlerInTee(trigger, fn, tees)` |
| 2 | Securely fetches a secret inside the enclave | `runtime.getSecret({ id })` |
| 3 | Executes a capability call from within the enclave | `HTTPClient.sendRequest(teeRuntime, req)` |
| 4 | Returns to the DON for any operations requiring decentralized consensus | `runtime.usingTheDons()` |

### Use Cases

- **Automated liquidation protection**: Automatically protect DeFi lending positions by continuously monitoring liquidation risk and executing collateral management, debt repayment while preserving the confidentiality of centralized exchange as well as LLM API keys, proprietary risk management thresholds, and execution preferences.
- **Automated portfolio rebalancing**: Automatically rebalance crypto portfolios by continuously monitoring allocation drift and executing portfolio adjustments when predefined thresholds are exceeded, while preserving the confidentiality of exchange API keys, LLM reasoning, portfolio allocation thresholds, and execution preferences.
- **AI smart contract audit firewall**: Automatically analyze and screen smart contract interactions before execution to detect and block malicious transactions, while preserving the confidentiality of chain scanner and LLM reasoning API credentials.

## Architecture

```
┌──────────────┐
│  CronTrigger │  fires on schedule (runs on the Workflow DON)
└──────┬───────┘
       │  DON hands the triggered request to an enclave
       v
╔══════════════════════════════════════════════════════════════╗
║  ENCLAVE (TEE)                                               ║
║  Data below is kept confidential from node operators.        ║
║  The binary — including this logic — is NOT confidential.    ║
║                                                              ║
║   getSecret({ id: 'REVENUE_API_TOKEN' })                     ║
║             ▲                                                ║
║             └── released by Vault DON, decrypted in-enclave  ║
║                                                              ║
║   HTTPClient.sendRequest(runtime, {                          ║
║     url: '<consoleBaseUrl>/api/business/<issuerId>/revenue'  ║
║   })                                                          ║
║             Authorization: Bearer <secret>                   ║
║             ▲ request + response payloads stay confidential  ║
║                                                              ║
║   Tally's real underwriting policy over confidential data:   ║
║     classifyDecline(revenue) -> reasonCode                   ║
║     computeDiscountRate(revenue) -> coupon bps               ║
╚═══════════════════════════╤══════════════════════════════════╝
                            │  runtime.usingTheDons()
                            │  ONLY issuerId + verdict + bps + reasonCode cross out
                            v
┌──────────────────────────────────────────────────────────────┐
│  WORKFLOW DON — donRuntime.report({ ... })                   │
│  Consensus verifies the enclave attestations, proving the    │
│  integrity of the logic executed in the enclave, then signs  │
└──────────────────────────────────────────────────────────────┘
```

## What the workflow does

`underwriting/workflow.ts` (entry point wired up by `underwriting/main.ts`):

1. **Registers the cron handler with `cre.handlerInTee`**, constrained to `[{ tee: 'nitro', regions: ['us-west-2'] }]`
2. **Fetches the `REVENUE_API_TOKEN` secret** with `runtime.getSecret({ id: config.secretId })` — the Vault DON releases it only into an attested enclave, and it's decrypted at the moment the call runs
3. **Calls Tally's own console API** — `GET {consoleBaseUrl}/api/business/{issuerId}/revenue` — with `HTTPClient.sendRequest(runtime, ...)`, passing the `TeeRuntime` so the request executes from inside the enclave with the secret in the `Authorization` header. This is a real trailing-90-day revenue snapshot (`trailing90dTotalUSD`, `volatilityScore`, `historyDays`) computed by `apps/console` from a business's actual registered/submitted transactions — never a fixture.
4. **Applies Tally's real underwriting policy** (`underwriting/pricing.ts`, a byte-for-byte mirror of `packages/underwriting/src/pricing.ts` — duplicated because this bun/WASM toolchain sits outside the pnpm workspace graph, so a `file:` dependency across that boundary doesn't resolve): `classifyDecline` checks history length, revenue threshold, and volatility ceiling; `computeDiscountRate` derives the coupon rate in basis points. This is the logic that stays confidential from node operators, applied over the confidential revenue figures fetched above.
5. **Logs only the verdict** — `runtime.log(...)` records `approved`, `recommendedCouponBps`, and `reasonCode`, never the raw revenue total or volatility score
6. **Crosses back with `usingTheDons()`** and generates a signed report ABI-encoding `(issuerId, approved, recommendedCouponBps, reasonCode)` — never the underlying revenue figures

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) runtime installed
- [CRE CLI](https://docs.chain.link/cre) installed
- Enrollment in the Confidential Workflows private beta (required to **deploy**; see the note above)

### 1. Install Dependencies

```bash
cd underwriting && bun install && cd ..
```

### 2. Configure Secrets

```bash
cp .env.example .env
```

Then set `CRE_REVENUE_API_TOKEN` in `.env` to the same value as the console app's own `REVENUE_API_TOKEN` (see `../../.env.example`) — the console checks the bearer token presented against that value. `secrets.yaml` maps the workflow-facing secret ID `REVENUE_API_TOKEN` to that environment variable:

```yaml
secretsNames:
    REVENUE_API_TOKEN:
        - CRE_REVENUE_API_TOKEN
```

You'll also need the real console app (`apps/console`) running and reachable at the `consoleBaseUrl` set in `underwriting/config.staging.json` (default `http://localhost:3000`), with a real registered business at the `issuerId` configured there.

### 3. Run Tests

```bash
cd underwriting && bun test
```

### 4. Simulate

```bash
cre workflow simulate underwriting --target staging-settings --non-interactive --trigger-index 0
```

Real, most-recently-observed output for Corrado's Deli (the one disclosed synthetic-data demo business — see the top-level README's "Demo data disclosure"):

```
2026-09-10T00:00:00Z [SIMULATION] Running trigger trigger=cron-trigger@1.0.0
╭────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Trigger requested TEE Execution your trigger will run in one of the following Tees:                │
│     - AWS Nitro in us-west-2                                                                       │
│ The simulator is not a real TEE, and is meant to debug.                                            │
│ Do not use it for sensitive information.                                                           │
│ During real execution, user logs for this trigger will not be visible, and will not leave the TEE. │
│ They are presented in the simulator for debugging only.                                            │
╰────────────────────────────────────────────────────────────────────────────────────────────────────╯

2026-09-10T00:00:00Z [USER LOG] Underwriting complete for issuer-corrados-deli-f5bb20: approved=true bps=428 reason=0

✓ Workflow Simulation Result:
"APPROVED (bps=428, reason=0)"
```

A freshly-registered business with no revenue history produces a genuine decline instead — `reason=2` (`INSUFFICIENT_HISTORY`) — since `classifyDecline` checks `historyDays < 30` before it ever looks at revenue or volatility. Neither outcome is scripted; both come straight from the real console API response for whatever `issuerId` is configured.

Two things to notice:

- The simulator confirms the TEE constraint it resolved (`AWS Nitro in us-west-2`) and warns that **it is not a real enclave** — logs are shown for debugging only. In real execution those logs never leave the TEE.
- Only the verdict log line (`approved`, `bps`, `reason`) is ever printed — never `trailing90dTotalUSD` or `volatilityScore`, which stay confidential inside the enclave per `workflow.ts`'s own logging discipline.

## Configuration

`underwriting/config.staging.json` / `underwriting/config.production.json`:

| Field | Description |
|-------|-------------|
| `schedule` | Cron expression (6 fields, seconds first) |
| `consoleBaseUrl` | Base URL of the running console app (`apps/console`) whose revenue API this workflow calls |
| `issuerId` | Which registered business to underwrite |
| `secretId` | Secret ID fetched with `runtime.getSecret()`; must match `secrets.yaml` (`"REVENUE_API_TOKEN"`) |

Staging polls every minute against `http://localhost:3000`; production polls every 5 minutes and expects `consoleBaseUrl` replaced with the deployed console's real URL.

## TEE constraints

The third argument to `handlerInTee` declares which enclaves the handler accepts:

```ts
{}                                          // any registered TEE, any region
{ regions: ['us-west-2'] }                  // any TEE, restricted to a region
[{ tee: 'nitro', regions: ['us-west-2'] }]  // specific TEE types and regions
```

AWS Nitro in `us-west-2` is currently the only registered TEE type and region. This is an actively evolving API — check your installed SDK version if you expect otherwise.

## Confidentiality boundary

Understanding what is and isn't protected matters more here than in a regular workflow.

| Protected by default | **Not** automatically protected |
|----------------------|--------------------------------|
| Secrets the Vault DON releases into the enclave | Triggers, chain reads, and chain writes — these always run on Workflow DON nodes |
| Request and response payloads of HTTP calls made from the enclave | Your workflow's **source code and deployed binary, including the logic executed in the enclave** |
| Sensitive inputs and intermediate values you don't share outside the enclave | Capability calls not routed through the enclave |
| Enclave execution memory, while your computation runs | Reports, calldata, and any output you deliver outside the enclave |

Consequences worth internalizing:

- **The logic is not confidential — the data is.** A confidential workflow, despite running inside the enclave, is part of the binary the Workflow DON provides to the enclave, so that binary including the enclave logic is revealed. What running that logic in the enclave currently provides is confidentiality of the *data* it computes over: Vault DON secrets such as API keys, the request and response payloads of HTTP calls made from the enclave, and other intermediate values. Confidential logic is on the future roadmap, not part of the current beta.
- **`usingTheDons()` is a one-way door.** Anything you pass into a capability call on that runtime executes on Workflow DON nodes like any non-confidential call. Cross over only the data that does not need to stay confidential.
- **Logs are for simulation only.** Every `runtime.log()` inside the enclave MUST be removed before deploying to production to preserve the confidentiality offered by enclaves — and logging should be avoided for sensitive and non-sensitive values alike.
- **Keep enclave logic deterministic.** The Workflow DON verifies enclave attestations and reaches consensus before the workflow completes successfully.
- **Multiple confidential workflows may execute within the same enclave.** Workflows are isolated from one another by the wasmtime. Dedicated per workflow enclave isolation is planned as a future enhancement.

## Status and possible extensions

The underwriting logic itself is complete and simulation-verified (see the top-level `docs/PROJECT_REPORT.md`); only the live TEE deploy is outstanding, pending Chainlink's Confidential Workflows private-beta access review (`FEEDBACK/CHAINLINK.md`). Today the verdict crosses to the Workflow DON via `donRuntime.report(...)` and stops there — nothing in this workflow writes it on-chain or calls back into the console; `apps/console/lib/bonds.ts`'s own `issueBondForBusiness` applies the same underwriting policy (`packages/underwriting`) directly rather than waiting on this workflow's output, so the demo issuance flow doesn't depend on live CRE deployment.

If extending this further:

- **Deliver the report on-chain**: `project.yaml`'s RPCs are already configured for Sepolia, so a future version could pass the report to `evmClient.writeReport(donRuntime, report)` and have the console (or a subgraph) read the verdict from there instead of computing it locally
- **Change the trigger**: `handlerInTee` accepts any CRE trigger, same as `handler` — swap cron for a log trigger to react to on-chain events confidentially
- **Fetch more secrets**: call `runtime.getSecret()` once per secret; the TypeScript `SecretsProvider` has no batch variant

## Which secrets belong in an enclave?

Not every secret needs enclave-level protection.

**Higher-value — consider enclave execution:** wallet and CA private keys; exchange, custody, payment-processor, banking, or LLM-provider credentials; OAuth client secrets, JWT signing keys, KMS keys; payment data, health data, other PII.

**Lower-value — regular DON execution is usually fine:** API keys for publicly available data (weather, explorers, public price feeds, public RPCs); public wallet addresses.

The common thread: a secret belongs in the enclave if disclosure would expose more than the workflow needs.

## Security

- Never commit `.env` files or secrets — `.gitignore` covers `*.env`
- Remove every `runtime.log()` inside the TEE handler before deploying to production
- Audit what crosses `usingTheDons()`; that data is no longer confidential
- Do not treat the enclave logic as secret — the binary that contains it is provided to the enclave by the Workflow DON and is revealed

## Further Reading

- [Confidential Workflows in CRE](https://docs.chain.link/cre/concepts/confidential-workflows) — concepts and use cases
- [Making a Workflow Confidential](https://docs.chain.link/cre/guides/workflow/using-confidential-workflows) — step-by-step guide
- [Confidential Workflows Client SDK Reference](https://docs.chain.link/cre/reference/sdk/confidential-workflows-client) — full API
- [Confidential HTTP](https://docs.chain.link/cre/capabilities/confidential-http) — for a single outbound request, without a full confidential handler
- [confidential-compute-examples](https://github.com/smartcontractkit/confidential-compute-examples) — production-shaped reference workflows

## License

MIT
