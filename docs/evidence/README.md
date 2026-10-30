# Evidence

Real command output and transaction references backing the claims in the
top-level README and `docs/BLI_SUBMISSION.md`. Nothing in this directory is
hand-written or edited after capture.

| File | What it is | Status |
|---|---|---|
| `cre-simulation.log` | Full output of `cre workflow simulate underwriting --target staging-settings --broadcast`, including the Sepolia transaction that delivers the verdict to `UnderwritingRegistry` | **Not yet captured** — needs a funded Sepolia key and a logged-in CRE CLI (`cre login`) |

Capture it with:

```bash
cd cre/tally-cre
cre workflow simulate underwriting --target staging-settings --broadcast \
  2>&1 | tee ../../docs/evidence/cre-simulation.log
```

Before running it: deploy the registry, then set `evm.registryAddress` in
`underwriting/config.staging.json` to the deployed address.

```bash
cd contracts
forge script script/DeployUnderwritingRegistry.s.sol \
  --rpc-url sepolia --broadcast --private-key $SEPOLIA_PRIVATE_KEY
```
