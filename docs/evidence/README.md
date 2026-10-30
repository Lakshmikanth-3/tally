# Evidence

Real command output and transaction references backing the claims in the
top-level README and `docs/BLI_SUBMISSION.md`. Nothing in this directory is
hand-written or edited after capture, beyond stripping terminal escape codes
from the simulator's progress bar so the log is readable as text.

| File | What it is |
|---|---|
| `cre-simulation.log` | Full output of `cre workflow simulate underwriting --target staging-settings --broadcast`, run 2026-10-30. Ends with the Sepolia transaction that delivered the verdict to `UnderwritingRegistry`. |
| `onchain-verification.txt` | The same verdict read back out of the contract over a public Sepolia RPC, so the claim does not rest on the simulator's own word. |
| `live-don-execution.log` | Execution `118714e9…f8087` on Chainlink's real DON, pulled from the CRE CLI: nine nodes each logging the identical verdict. Also shows the enclave failing with `DON members not set`, and that the run predates the on-chain write. |

## What the run produced

- **Registry:** [`0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c`](https://sepolia.etherscan.io/address/0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c) on Ethereum Sepolia
- **Verdict tx:** [`0xa58ea689…f4e085`](https://sepolia.etherscan.io/tx/0xa58ea689f0b8f3f4cfbcb1f71ca5ccb241a80f0da734d880a1a09fcf94f4e085)
- **Stored verdict:** `approved=false, couponBps=760, reasonCode=3, exists=true`

Reason code 3 is `VOLATILITY_TOO_HIGH`. The demo issuer's seeded revenue has a
volatility score of 100 against a policy ceiling of 40, so a decline is the
correct answer — the policy in `packages/underwriting` is applied for real, not
staged to produce a flattering result. The 760 bps figure follows the published
formula: 400 + 4 × (100 − 10).

## Reproducing it

```bash
cd cre/tally-cre
cre workflow simulate underwriting --target staging-settings --broadcast \
  2>&1 | tee ../../docs/evidence/cre-simulation.log
```

This needs a funded Sepolia key, a logged-in CRE CLI (`cre login`), `bun` on
PATH as a real `bun.exe` (on Windows the npm `.cmd`/`.ps1` shims are not
enough — the compiler calls `spawn('bun')`, which cannot execute them), and
`REVENUE_API_TOKEN` set on the deployed console to the same value as
`CRE_REVENUE_API_TOKEN` in `cre/tally-cre/.env`.

The **config hash** above only reproduces if `config.staging.json` is checked
out with LF line endings — the toolchain hashes the file's bytes, so a CRLF
checkout silently yields a different hash. `.gitattributes` pins it.

To deploy a fresh registry first:

```bash
cd contracts
forge create src/UnderwritingRegistry.sol:UnderwritingRegistry \
  --rpc-url sepolia --private-key $SEPOLIA_PRIVATE_KEY --broadcast \
  --gas-limit 5000000 \
  --constructor-args 0x15fC6ae953E024d975e77382eEeC56A9101f9F88
```

Then set `evm.registryAddress` in `underwriting/config.staging.json`.

**Two gas notes, both learned the hard way on this chain.** Foundry's own
estimate was low enough that the deploy ran out of gas twice, hence the explicit
`--gas-limit`. And the first broadcast run wrote with a 500,000 gas limit: the
forwarder transaction was mined with status 1, but `onReport` ran out of the gas
passed on to it, so the verdict was never stored. The config now uses 3,000,000.
A green transaction receipt is not on its own proof that a CRE write landed —
which is why `onchain-verification.txt` reads the state back.
