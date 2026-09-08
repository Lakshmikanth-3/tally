import { Management, ResolveLatestConfigVersionRequest } from '@hashgraph/asset-tokenization-sdk';
import { ATS_TESTNET } from './init';

/// Queries the real, live latest registered Bond business-logic config
/// version from the resolver contract — replaces the hardcoded placeholder
/// this codebase used before (confirmed live via this exact call: version 1
/// as of 2026-09-08). Call this fresh before issuance rather than caching
/// indefinitely, since the resolver's registered config can be updated.
export async function resolveLatestBondConfigVersion(): Promise<number> {
  const { payload } = await Management.resolveLatestConfigVersion(
    new ResolveLatestConfigVersionRequest({
      resolverAddress: ATS_TESTNET.resolverAddress,
      configurationId: ATS_TESTNET.bondConfigId,
    }),
  );
  return payload;
}
