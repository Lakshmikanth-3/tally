import { startBrowserSignerSession } from './runner';
import { buildIsin } from '../src/isin';
import { readFileSync } from 'node:fs';

const envText = readFileSync('../../.env', 'utf8');
const env: Record<string, string> = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Real end-to-end redemption smoke test: issues a bond with a maturity date
// only a couple minutes out (redemption itself is the thing being tested,
// not underwriting realism), waits for real wall-clock time to pass that
// maturity, then calls the real redeemBondAtMaturity.
async function main() {
  const session = await startBrowserSignerSession({
    privateKeyHex: env.HEDERA_ECDSA_PRIVATE_KEY,
    rpcUrl: 'https://testnet.hashio.io/api',
  });

  try {
    const creds = {
      accountId: env.HEDERA_ECDSA_ACCOUNT_ID,
      evmAddress: '0xcfFc4DA1Cb5C88152e5f90994048f363Bd715777',
      privateKeyHex: env.HEDERA_ECDSA_PRIVATE_KEY,
    };

    console.log('Connecting...');
    const connectResult = await session.page.evaluate(async (c) => {
      try {
        await window.__tally.connectAtsBackend(c);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }, creds);
    console.log('connect:', JSON.stringify(connectResult));
    if (!connectResult.ok) return;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const maturitySeconds = nowSeconds + 150;
    const issueParams = {
      issuerAccountId: env.HEDERA_ECDSA_ACCOUNT_ID,
      issuerEvmAddress: creds.evmAddress,
      name: "Corrado's Deli Redemption Test Bond",
      symbol: 'CORRADOR',
      isin: buildIsin('US', 'TALLYREDM'),
      faceValueUSD: '14739',
      couponBps: 412,
      startingDateSeconds: nowSeconds + 60,
      maturityDateSeconds: maturitySeconds,
    };

    console.log('Issuing real short-maturity bond...', JSON.stringify(issueParams));
    const issueResult = await session.page.evaluate(async (params) => {
      try {
        const res = await window.__tally.issueFixedRateBond(params);
        return { ok: true, res };
      } catch (err) {
        return { ok: false, error: (err as Error).message, stack: (err as Error).stack };
      }
    }, issueParams);
    console.log('issue result:', JSON.stringify(issueResult, null, 2));
    if (!issueResult.ok) return;

    const bondTokenId = (issueResult.res as any).bondTokenId.value as string;
    const waitSeconds = maturitySeconds - Math.floor(Date.now() / 1000) + 15;
    console.log(`Waiting ${waitSeconds}s for real maturity to pass...`);
    await sleep(Math.max(0, waitSeconds) * 1000);

    const redeemParams = {
      securityId: bondTokenId,
      sourceId: env.HEDERA_ECDSA_ACCOUNT_ID,
      sourceEvmAddress: creds.evmAddress,
      sourcePrivateKeyHex: env.HEDERA_ECDSA_PRIVATE_KEY,
    };
    console.log('Redeeming at maturity...', JSON.stringify(redeemParams));
    const redeemResult = await session.page.evaluate(async (params) => {
      try {
        const res = await window.__tally.redeemBondAtMaturity(params);
        return { ok: true, res };
      } catch (err) {
        return { ok: false, error: (err as Error).message, stack: (err as Error).stack };
      }
    }, redeemParams);
    console.log('redeem result:', JSON.stringify(redeemResult, null, 2));
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
