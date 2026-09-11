'use client';

import { useState } from 'react';

interface Props {
  issuerId: string;
  maturityDateSeconds: number | null;
  redeemedAt: number | null;
  redeemTransactionId: string | null;
  redeemOnTime: boolean | null;
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

/// Executes the real ATS redemption call at (or after) maturity — see
/// lib/redemption.ts. A separate, explicit action, same reasoning as
/// CouponSchedulePanel: a real on-chain transaction, not something to fire
/// automatically inside another flow.
export default function RedemptionPanel({ issuerId, maturityDateSeconds, redeemedAt, redeemTransactionId, redeemOnTime }: Props) {
  const [redeemed, setRedeemed] = useState<{ transactionId: string; onTime: boolean } | null>(
    redeemedAt && redeemTransactionId ? { transactionId: redeemTransactionId, onTime: Boolean(redeemOnTime) } : null,
  );
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const matured = maturityDateSeconds !== null && nowSeconds >= maturityDateSeconds;

  async function handleRedeem() {
    setRedeeming(true);
    setError(null);
    try {
      const res = await fetch(`/api/business/${issuerId}/bond/redeem`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed to redeem bond');
      setRedeemed({ transactionId: data.transactionId, onTime: data.onTime });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <p className="stat-label" style={{ marginBottom: 10 }}>
        Redemption
      </p>
      {redeemed ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--success)' }}>
          ✓ Redeemed on-chain —{' '}
          <a href={`https://hashscan.io/testnet/transaction/${redeemed.transactionId}`} target="_blank" rel="noreferrer">
            {redeemed.transactionId.slice(0, 20)}… ↗
          </a>{' '}
          ({redeemed.onTime ? 'on time' : 'late'}).
        </p>
      ) : matured ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>This bond has matured — principal can be redeemed now.</p>
          <button className="secondary" onClick={handleRedeem} disabled={redeeming}>
            {redeeming ? <span className="spinner" /> : 'Redeem at maturity'}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
          Not yet matured{maturityDateSeconds ? ` — matures ${formatDate(maturityDateSeconds)}` : ''}.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
