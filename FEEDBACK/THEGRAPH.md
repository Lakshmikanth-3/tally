# Feedback: The Graph (Subgraph Studio)

Tally indexes every issuer's repayment history — coupons, redemptions,
resales — through a real deployed subgraph
(https://thegraph.com/studio/subgraph/tally-register), built to turn
`SettlementAnchor`'s on-chain events into a public, queryable performance
register per issuer.

## What worked well

- Once the schema and mappings were right, indexing was fast and reliable —
  anchoring a real on-chain event and querying it back through Studio's
  hosted query endpoint worked cleanly on the first real end-to-end test.
- `graph codegen`/`graph build`/`graph deploy` is a smooth, well-documented
  local workflow; the generated AssemblyScript types from `schema.graphql`
  caught real mapping bugs before deploy rather than after.

## Friction points

1. **Subgraph Studio does not support Hedera as an indexable network.** We
   verified this directly against Studio's own supported-networks list
   before building anything, which meant deciding up front how to still get
   real subgraph indexing for a Hedera-native product. Our real solution:
   `SettlementAnchor` and `SecondaryMarket` are deployed *twice* from the
   same custodian account (`0xFa5FE1d656B9d2D382D9Fc717Bd22c1f79Add9f4`
   / `0x3d56CC4eEFe9c51957F2B34096e29Ef0B4fc84d4` on Sepolia) — once on Hedera
   testnet as the real product deployment issuers actually issue against
   (`0.0.10501789` / `0.0.10501801`), and once on Ethereum Sepolia purely so
   the subgraph has a supported network to index. This is a real, working
   solution, but it's a genuine architectural compromise a Hedera-native
   project shouldn't have to make: the "real" event stream a bond's lifecycle
   actually emits on Hedera and the stream The Graph indexes are, by
   necessity, two separate deployments kept in sync by us, not the same
   contract instance.
2. This split adds real operational surface area — every event that needs to
   show up in the subgraph has to be anchored on *both* deployments
   deliberately, which is exactly the kind of manual-consistency requirement
   indexing infrastructure is supposed to remove.

## What we'd want improved

- Hedera (or Hedera's EVM-compatible JSON-RPC layer, which is otherwise a
  fully standard EVM chain) added to Subgraph Studio's supported-network
  list. Hedera already exposes a real, standard `eth_getLogs`-compatible
  JSON-RPC relay (Hashio) — the missing piece looks like it's specifically
  Studio's network allowlist, not an underlying technical incompatibility.
- Short of that, clearer guidance in the docs for teams building on an
  unsupported-but-EVM-compatible chain about the "mirror the same
  deterministic deployment onto a supported chain for indexing purposes"
  pattern we ended up landing on ourselves — it works, but we found it by
  trial and error, not by being pointed at it.

The Graph's actual indexing/query experience was excellent once we were
indexing a supported chain — the friction here is entirely about network
support, not query or tooling quality.
