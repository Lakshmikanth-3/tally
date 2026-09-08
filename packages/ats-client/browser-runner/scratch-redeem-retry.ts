import { startBrowserSignerSession } from './runner';
import { readFileSync } from 'node:fs';

const envText = readFileSync('../../.env', 'utf8');
const env: Record<string, string> = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

// Retries redemption against the already-issued, already-matured bond from
// scratch-redeem-test.ts (0.0.10425352) — avoids paying the real ~2 minute
// maturity wait again while iterating on the redemption call itself.
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

    const redeemParams = {
      securityId: '0.0.10425352',
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
