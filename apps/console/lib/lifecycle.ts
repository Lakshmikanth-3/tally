import { ethers } from 'ethers';
import { buildHederaClient, settleCouponAndAnchor } from '@tally/scheduler';
import { getCustodian, listAllIssuedBonds } from './bonds';
import { armCouponForBond, listCouponPayments, markCouponPaymentAnchored } from './coupon-schedule';
import { redeemBondForBusiness } from './redemption';
import { computeBondId } from './secondary-market';
import { withCustodianLock } from './custodian-lock';

const SETTLEMENT_ANCHOR_HEDERA_ID = '0.0.10501789'; // real deployed anchor — see lib/explorer.ts's PROOF_ENTRIES

export interface LifecycleRunSummary {
  armedCoupons: string[];
  anchoredCoupons: string[];
  redeemedBonds: string[];
  errors: { issuerId: string; step: string; message: string }[];
}

/// The real periodic sweep this project was always missing: nothing else
/// ever calls armCouponForBond once a bond falls inside Hedera's
/// schedulable window, settleCouponAndAnchor once a scheduled coupon has
/// actually executed, or redeemBondForBusiness once a bond has matured.
/// Each step is independently idempotent (checked against the bond's own
/// real persisted state before acting), so calling this repeatedly is safe
/// — see instrumentation.ts for what actually calls it on a schedule.
///
/// Deliberately does NOT take the custodian lock around the whole sweep:
/// the operations it calls take that lock themselves, so wrapping the sweep
/// too would deadlock — the outer hold would never release while the inner
/// calls queued behind it. Per-operation locking is also what's wanted, so
/// a user's action can interleave between a sweep's steps instead of
/// waiting out the entire sweep.
export async function runDueLifecycleActions(): Promise<LifecycleRunSummary> {
  const summary: LifecycleRunSummary = { armedCoupons: [], anchoredCoupons: [], redeemedBonds: [], errors: [] };
  const bonds = await listAllIssuedBonds();
  const nowSeconds = Math.floor(Date.now() / 1000);

  for (const bond of bonds) {
    if (!bond.bondTokenId || !bond.evmDiamondAddress || !bond.maturityDateSeconds) continue;

    // Arm whichever coupons have come inside Hedera's schedulable window
    // since the last sweep — a multi-coupon bond arms progressively, not
    // all at once (see lib/coupon-schedule.ts).
    try {
      const armed = await armCouponForBond(bond.issuerId);
      for (const coupon of armed) {
        summary.armedCoupons.push(`${bond.issuerId}#${coupon.couponIndex}`);
      }
    } catch (err) {
      // A coupon still beyond the window, or a bond with nothing left to
      // arm, hits this on every sweep — the expected steady state, not an
      // error worth reporting each time.
      const message = (err as Error).message;
      const expected =
        message.includes("can't schedule a transaction this far in advance") || message.includes('already armed or past due');
      if (!expected) {
        summary.errors.push({ issuerId: bond.issuerId, step: 'arm-coupon', message });
      }
    }

    // Anchor a Coupon lifecycle event for each armed coupon whose real
    // scheduled payment has actually executed — never speculatively.
    const duePayments = (await listCouponPayments(bond.issuerId, bond.createdAt)).filter(
      (c) => c.scheduleId !== null && c.anchoredAt === null && c.dueDateSeconds <= nowSeconds,
    );
    if (duePayments.length > 0) {
      // Captured before the closure below: the null checks at the top of
      // this loop don't narrow through it, since it runs once the lock frees.
      const evmDiamondAddress = bond.evmDiamondAddress;
      const bondTokenId = bond.bondTokenId;
      try {
        // anchorNow signs with the custodian key too, so it shares the same
        // queue as every other custodian write (see custodian-lock.ts).
        await withCustodianLock(async () => {
        const custodian = getCustodian();
        const client = buildHederaClient({ accountId: custodian.accountId, privateKeyHex: custodian.privateKeyHex });
        try {
          const bondIdHex = computeBondId(evmDiamondAddress, bondTokenId);
          for (const coupon of duePayments) {
            const outcome = await settleCouponAndAnchor(client, {
              settlementAnchorContractId: SETTLEMENT_ANCHOR_HEDERA_ID,
              scheduleId: coupon.scheduleId!,
              dueDateSeconds: coupon.dueDateSeconds,
              bondId: ethers.getBytes(bondIdHex),
              issuerEvmAddress: custodian.evmAddress,
              // No real HCS topic submission exists in this project — this
              // field is a free-text audit reference (see the one real
              // existing anchored event's hcsTxId, "genesis-issuance-test"),
              // so the real scheduleId is an honest, real value here.
              hcsTxId: coupon.scheduleId!,
            });
            if (outcome.status === 'anchored') {
              await markCouponPaymentAnchored(bond.issuerId, bond.createdAt, coupon.couponIndex, outcome.anchor.transactionId, outcome.onTime);
              summary.anchoredCoupons.push(`${bond.issuerId}#${coupon.couponIndex}`);
            }
          }
        } finally {
          client.close();
        }
        });
      } catch (err) {
        summary.errors.push({ issuerId: bond.issuerId, step: 'anchor-coupon', message: (err as Error).message });
      }
    }

    if (!bond.redeemedAt && nowSeconds >= bond.maturityDateSeconds) {
      try {
        await redeemBondForBusiness(bond.issuerId);
        summary.redeemedBonds.push(bond.issuerId);
      } catch (err) {
        summary.errors.push({ issuerId: bond.issuerId, step: 'redeem', message: (err as Error).message });
      }
    }
  }

  return summary;
}
