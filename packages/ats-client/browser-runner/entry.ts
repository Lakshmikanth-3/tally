// Browser entry point for driving the ATS SDK's real signing path.
//
// The ATS SDK gates its RPC/MetaMask transaction adapter behind
// `Injectable.isWeb()` (`!!global.window`) and, once enabled, calls real
// browser APIs (`window.ethereum`, `detectEthereumProvider`,
// `window.addEventListener`) that only exist in an actual browser — a
// plain Node.js script with a faked `window = {}` breaks partway through
// (see packages/ats-client/src/init.ts's doc comments for the full trace).
//
// This file is bundled with esbuild (see build.mjs) and run inside a real
// (headless) Chromium tab via Playwright, with `window.ethereum` supplied
// by runner.ts — a minimal EIP-1193 provider backed by a real ethers.Wallet
// on the Node side. The SDK itself runs completely unmodified, exactly as
// it's designed to.
import { connectAtsBackend, depositBondToMarket, issueFixedRateBond, redeemBondAtMaturity, resolveLatestBondConfigVersion } from '../src';

declare global {
  interface Window {
    __tally: {
      connectAtsBackend: typeof connectAtsBackend;
      issueFixedRateBond: typeof issueFixedRateBond;
      redeemBondAtMaturity: typeof redeemBondAtMaturity;
      resolveLatestBondConfigVersion: typeof resolveLatestBondConfigVersion;
      depositBondToMarket: typeof depositBondToMarket;
    };
  }
}

window.__tally = { connectAtsBackend, issueFixedRateBond, redeemBondAtMaturity, resolveLatestBondConfigVersion, depositBondToMarket };
