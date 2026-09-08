/// Whether a real, network-attested settlement timestamp met its due date.
/// The only place "on time" is ever decided — callers must feed it a real
/// mirror-node timestamp (see ./mirror), never a hand-set boolean.
export function isSettlementOnTime(actualTimestampSeconds: number, dueDateSeconds: number): boolean {
  return actualTimestampSeconds <= dueDateSeconds;
}
