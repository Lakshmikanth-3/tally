import { Client, PrivateKey } from '@hashgraph/sdk';

export interface HederaOperator {
  accountId: string; // e.g. "0.0.xxxxx"
  privateKeyHex: string; // ECDSA raw hex (0x-prefixed or not)
}

/// Builds a real Hedera testnet client authenticated as the given operator.
/// This is the account that pays for and (unless overridden) signs the
/// scheduled transactions below — it must be the same EVM address configured
/// as `recorder` on the deployed SettlementAnchor for anchor() calls to
/// succeed (see contracts/src/SettlementAnchor.sol's onlyRecorder gate).
export function buildHederaClient(operator: HederaOperator): Client {
  const key = operator.privateKeyHex.startsWith('0x')
    ? PrivateKey.fromStringECDSA(operator.privateKeyHex)
    : PrivateKey.fromStringECDSA(`0x${operator.privateKeyHex}`);

  return Client.forTestnet().setOperator(operator.accountId, key);
}
