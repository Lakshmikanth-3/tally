import { ethers } from 'ethers';
import { buildHederaClient, settleCouponAndAnchor } from '@tally/scheduler';
import { getCustodian, listAllIssuedBonds, markCouponAnchored } from './bonds';
import { armCouponForBond } from './coupon-schedule';
import { redeemBondForBusiness } from './redemption';
import { computeBondId } from './secondary-market';

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
export async function runDueLifecycleActions(): Promise<LifecycleRunSummary> {
  const summary: LifecycleRunSummary = { armedCoupons: [], anchoredCoupons: [], redeemedBonds: [], errors: [] };
  const bonds = listAllIssuedBonds();
  const nowSeconds = Math.floor(Date.now() / 1000);

  for (const bond of bonds) {
    if (!bond.bondTokenId || !bond.evmDiamondAddress || !bond.maturityDateSeconds) continue;

    if (!bond.couponScheduleId) {
      try {
        await armCouponForBond(bond.issuerId);
        summary.armedCoupons.push(bond.issuerId);
      } catch (err) {
        // A bond maturing more than ~60 days out will hit this on every
        // sweep until it falls inside Hedera's schedulable window — that's
        // the expected, real steady state, not something to report as an
        // error each time.
        const message = (err as Error).message;
        if (!message.includes("can't schedule a transaction this far in advance")) {
          summary.errors.push({ issuerId: bond.issuerId, step: 'arm-coupon', message });
        }
      }
    }

    if (bond.couponScheduleId && !bond.couponAnchoredAt) {
      try {
        const custodian = getCustodian();
        const client = buildHederaClient({ accountId: custodian.accountId, privateKeyHex: custodian.privateKeyHex });
        try {
          const bondIdHex = computeBondId(bond.evmDiamondAddress, bond.bondTokenId);
          const outcome = await settleCouponAndAnchor(client, {
            settlementAnchorContractId: SETTLEMENT_ANCHOR_HEDERA_ID,
            scheduleId: bond.couponScheduleId,
            dueDateSeconds: bond.couponDueDateSeconds ?? bond.maturityDateSeconds,
            bondId: ethers.getBytes(bondIdHex),
            issuerEvmAddress: custodian.evmAddress,
            // No real HCS topic submission exists in this project — this
            // field is a free-text audit reference (see the one real
            // existing anchored event's hcsTxId, "genesis-issuance-test"),
            // so the real scheduleId is an honest, real value here.
            hcsTxId: bond.couponScheduleId,
          });
          if (outcome.status === 'anchored') {
            markCouponAnchored(bond.issuerId, bond.createdAt, outcome.anchor.transactionId);
            summary.anchoredCoupons.push(bond.issuerId);
          }
        } finally {
          client.close();
        }
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
