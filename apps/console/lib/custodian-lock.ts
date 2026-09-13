/// Serializes everything that signs with Tally's custodian key.
///
/// [VERIFIED via real failed transactions] Every on-chain write this app
/// makes — issuance, coupon arming, escrow deposits, market fills,
/// redemption — is signed by the same single custodian account, and its
/// nonce is shared state. The background lifecycle sweep
/// (lib/lifecycle-poller.ts) runs on a timer with no knowledge of what a
/// user is doing at that moment, so a sweep firing mid-redemption produced
/// real `nonce has already been used` failures that aborted the user's
/// action outright.
///
/// The poller's own `running` flag only stops two *sweeps* overlapping; it
/// can't see a request-initiated write at all. This lock is what both sides
/// share.
///
/// Scope and limits: this is an in-process queue, so it's only sufficient
/// while a single Node process owns the key — true for this app (one dev
/// server, one poller). Running several instances against the same
/// custodian account would reintroduce the same collisions and would need
/// real nonce coordination (or a key per worker) instead.
let queue: Promise<unknown> = Promise.resolve();

export function withCustodianLock<T>(operation: () => Promise<T>): Promise<T> {
  // Chain onto whatever is already queued, running whether the previous
  // operation resolved or rejected — one failure must not wedge the queue.
  const result = queue.then(operation, operation);
  // Keep the chain alive on rejection so a failed operation doesn't turn
  // into an unhandled rejection or block everything behind it.
  queue = result.catch(() => undefined);
  return result;
}
