import { startBrowserSignerSession } from './runner';
import { buildIsin } from '../src/isin';
import { readFileSync } from 'node:fs';

const envText = readFileSync('../../.env', 'utf8');
const env: Record<string, string> = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

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
    const issueParams = {
      issuerAccountId: env.HEDERA_ECDSA_ACCOUNT_ID, // Tally-as-custodian: the platform's own account is the on-chain owner of record, per the user's explicit custodian model
      issuerEvmAddress: '0xcfFc4DA1Cb5C88152e5f90994048f363Bd715777',
      name: "Corrado's Deli Revenue Bond",
      symbol: 'CORRADO1',
      isin: buildIsin('US', 'TALLYDEM0'), // real checksummed ISIN (Bond.create validates the checksum on-chain, not just format/length) — country code + 9-char testnet demo identifier, not a real registered security identifier
      faceValueUSD: '14739', // real computed trailing-90d revenue for this issuer, truncated to whole dollars
      couponBps: 412, // real verdict from the real CRE simulation just run
      startingDateSeconds: nowSeconds + 120, // a couple minutes ahead — the SDK validates startingDate >= "now" at actual validation time, which runs after several real network round-trips (connect, resolve config version), so "now" computed here would otherwise already be in the past by then
      maturityDateSeconds: nowSeconds + 120 + 90 * 86_400,
    };

    console.log('Issuing real fixed-rate bond...', JSON.stringify(issueParams));
    const issueResult = await session.page.evaluate(async (params) => {
      try {
        const res = await window.__tally.issueFixedRateBond(params);
        return { ok: true, res };
      } catch (err) {
        return { ok: false, error: (err as Error).message, stack: (err as Error).stack };
      }
    }, issueParams);
    console.log('issue result:', JSON.stringify(issueResult, null, 2));
  } finally {
    await session.close();
  }
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
