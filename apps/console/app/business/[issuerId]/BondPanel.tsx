'use client';

import { useEffect, useState } from 'react';

interface BondRecord {
  issuerId: string;
  status: 'declined' | 'issued' | 'failed';
  reasonCode: number;
  couponBps: number | null;
  faceValueUsd: string | null;
  symbol: string | null;
  isin: string | null;
  bondTokenId: string | null;
  evmDiamondAddress: string | null;
  transactionId: string | null;
  errorMessage: string | null;
  startingDateSeconds: number | null;
  maturityDateSeconds: number | null;
  createdAt: number;
}

// Mirrors @tally/seam's UnderwritingReasonCode — kept as a plain map here so
// this client component doesn't need a server-only workspace import.
const REASON_LABELS: Record<number, string> = {
  0: 'Approved',
  1: 'Revenue below the $3,000 trailing-90-day threshold',
  2: 'Fewer than 30 days of revenue history',
  3: 'Revenue volatility too high',
  4: 'Issuer has an open default',
};

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

export default function BondPanel({ issuerId }: { issuerId: string }) {
  const [bond, setBond] = useState<BondRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/business/${issuerId}/bond`)
      .then((res) => res.json())
      .then((data) => setBond(data.bond))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [issuerId]);

  async function handleIssue() {
    setIssuing(true);
    setError(null);
    try {
      const res = await fetch(`/api/business/${issuerId}/bond/issue`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'issuance failed');
      setBond(data.bond);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIssuing(false);
    }
  }

  if (loading) return <p>Loading bond status…</p>;

  return (
    <section>
      <h2>Underwriting &amp; bond</h2>

      {!bond && (
        <>
          <p>No underwriting attempt yet.</p>
          <button onClick={handleIssue} disabled={issuing}>
            {issuing ? 'Issuing on Hedera testnet — real transactions, ~15–30s…' : 'Run underwriting & issue bond'}
          </button>
        </>
      )}

      {bond && bond.status === 'declined' && (
        <>
          <p role="alert">Declined: {REASON_LABELS[bond.reasonCode] ?? `reason code ${bond.reasonCode}`}</p>
          <button onClick={handleIssue} disabled={issuing}>
            {issuing ? 'Re-checking…' : 'Re-run underwriting'}
          </button>
        </>
      )}

      {bond && bond.status === 'failed' && (
        <>
          <p role="alert">Issuance failed: {bond.errorMessage}</p>
          <button onClick={handleIssue} disabled={issuing}>
            {issuing ? 'Retrying — real transactions, ~15–30s…' : 'Retry issuance'}
          </button>
        </>
      )}

      {bond && bond.status === 'issued' && (
        <>
        <span className="badge-success">Issued on Hedera testnet</span>
        <dl className="details">
          <dt>Coupon rate</dt>
          <dd>{((bond.couponBps ?? 0) / 100).toFixed(2)}%</dd>
          <dt>Face value</dt>
          <dd>${bond.faceValueUsd}</dd>
          <dt>Symbol / ISIN</dt>
          <dd>
            {bond.symbol} / {bond.isin}
          </dd>
          <dt>Bond token ID</dt>
          <dd>
            <a href={`https://hashscan.io/testnet/token/${bond.bondTokenId}`} target="_blank" rel="noreferrer">
              {bond.bondTokenId}
            </a>
          </dd>
          <dt>Issuance transaction</dt>
          <dd>
            <a href={`https://hashscan.io/testnet/transaction/${bond.transactionId}`} target="_blank" rel="noreferrer">
              {bond.transactionId}
            </a>
          </dd>
          <dt>Maturity</dt>
          <dd>{bond.maturityDateSeconds ? formatDate(bond.maturityDateSeconds) : '—'}</dd>
        </dl>
        </>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}
