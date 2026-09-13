# Feedback: Chainlink (CRE Confidential Workflows)

Tally's underwriting is the whole point of the product: a shop's real
revenue is read privately, and only an approve/decline verdict plus a
coupon rate ever leaves the enclave. CRE's Confidential Workflows are the
exact right primitive for this — feedback below is from actually building
and simulating a real workflow (`cre/tally-cre`), not from reading the docs
in the abstract.

## What worked well

- The `handlerInTee` / `runtime.getSecret()` / `HTTPClient.sendRequest(teeRuntime, ...)`
  / `usingTheDons()` shape is genuinely clean once you understand the
  confidentiality boundary — it maps directly onto "fetch a secret, call an
  API with it, decide, only cross the decision back out."
- `cre workflow simulate --target staging-settings --non-interactive
  --trigger-index 0` gave us a fast, real feedback loop while wiring the
  workflow to our own revenue API — we could iterate on the real underwriting
  logic (fetch real revenue → apply real pricing → return a real verdict)
  entirely locally before touching a live deploy.
- The confidentiality model documentation (what's protected vs. not — logic
  isn't confidential, only the data flowing through the enclave is) is
  unusually clear and saved us from a wrong assumption early on.

## Friction points

1. **`cre workflow simulate` without `--target`/`--trigger-index` hangs on an
   interactive TUI picker with no clear signal that it's waiting on input** —
   easy to mistake for a stall. Worth calling out explicitly in the quickstart
   that non-interactive automation needs both flags.
2. **Confidential Workflows are gated behind a private-beta deploy-access
   request** (`cre account access`), which itself is an interactive terminal
   prompt (arrow-key Yes/No) with no flag to answer non-interactively — so it
   can't be scripted or run from anywhere but a real terminal a human is
   watching. For a hackathon timeline, this is the single biggest source of
   schedule risk in this whole integration: the workflow logic itself was
   correct and simulation-verified well before the access request could even
   be submitted, and the actual live deploy remained blocked on manual review
   turnaround with no stated SLA.
3. **No visibility into review queue position or expected turnaround** once
   the request is submitted — just "we'll review it and get back to you."
   For a hackathon submission deadline, even a rough estimate would help
   teams plan whether to build a deploy-dependent demo or fall back to
   simulation-based rehearsal. (Access was ultimately granted, and the
   workflow now deploys and executes live — the points below are all from
   that real deploy.)
4. **Deploying to staging demands an `ethereum-mainnet` RPC.** `cre workflow
   deploy --target staging-settings` fails outright with `missing RPC URL for
   ethereum-mainnet - required to deploy CRE workflows`, even for a workflow
   that touches no chain at all. The reason (CRE's Workflow Registry contract
   lives on mainnet) is reasonable, but the error arrives with no explanation
   and reads like a misconfigured target.
5. **`cre registry list` is the only place the registry choice is visible, and
   nothing warns that the default is the paid one.** Registering on
   `onchain:ethereum-mainnet` spends real mainnet gas; `private` is free and
   off-chain. A testnet/hackathon project almost certainly wants `private`, but
   you only discover the choice exists by running `registry list` — a one-line
   note in the deploy quickstart would save people from an accidental mainnet
   spend.
6. **Secrets aren't part of deploy, and the resulting failure doesn't say so.**
   `cre workflow deploy` uploads binary and config but not secrets, so the
   first executions fail with `relay quorum unreachable: 0 signed responses`
   buried inside a secret-retrieval error — which reads like a DON outage
   rather than "you haven't run `cre secrets create` yet."
7. **`--secrets-auth` defaults to `onchain`, which silently mismatches a
   `private`-registry deployment.** The correct pairing (`private` registry →
   `--secrets-auth browser`) isn't inferred from the workflow's own
   `deployment-registry`, and nothing warns when they disagree.
8. **`cre workflow list` silently omits private-registry workflows.** Right
   after a successful deploy, plain `cre workflow list` printed
   `No workflows found`; only `--registry private` showed the ACTIVE workflow.
   That gap is alarming when you've just deployed something.
9. **Confidential execution can fail while the overall execution reports
   SUCCESS.** Our live executions report `Status: SUCCESS` with a top-level
   `confidential-workflows capability execution failed: ... cannot validate
   enclave config: DON members not set`. The trigger, HTTP call, consensus and
   report all succeed, so the run looks healthy — but the `handlerInTee` body
   never ran in an attested enclave, meaning the confidentiality guarantee is
   silently absent. For a product whose entire value is confidentiality, this
   should be a hard failure, not a footnote on a green run. `DON members not
   set` is also undocumented, with no indication whether it's a provisioning
   delay, a private-registry limitation, or a misconfiguration on our side.

## What we'd want improved

- A non-interactive flag for `cre account access` (e.g. `--yes` alongside
  `--non-interactive`), so the request itself can be scripted even though the
  approval can't be.
- Some visible signal of expected review turnaround for deploy-access
  requests, especially relevant for time-boxed hackathon submissions.
- A louder warning in the simulate quickstart about the interactive picker
  trap when `--target`/`--trigger-index` are omitted.

We'd genuinely use Confidential Workflows again — the primitive is right for
privacy-sensitive underwriting, which is a real, recurring need in
credit/lending products, not just this hackathon's specific use case.
