'use client';

import { useState } from 'react';

/// Places a real ask on the real SecondaryMarket contract for this
/// business's issued bond, signed by Tally's custodian key, then deposits
/// the held unit into the contract's own balance so a fill against it can
/// actually succeed — see lib/secondary-market.ts, ats-client's deposit.ts,
/// and /market for the real order book.
export default function PlaceOrderPanel({ issuerId }: { issuerId: string }) {
  const [priceUSD, setPriceUSD] = useState('');
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ orderId: string; transactionId: string; depositTransactionId: string | null; depositError: string | null } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  async function handlePlace() {
    setPlacing(true);
    setError(null);
    setResult(null);
    try {
      // priceUSD input is a whole-dollar amount; convert to the contract's
      // 6-decimal fixed-point convention.
      const dollars = Number(priceUSD);
      if (!Number.isFinite(dollars) || dollars <= 0) throw new Error('enter a positive price in dollars');
      const priceUSDMicros = String(Math.round(dollars * 1_000_000));

      const res = await fetch(`/api/business/${issuerId}/market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceUSD: priceUSDMicros, isBid: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed to place order');
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <p className="stat-label" style={{ marginBottom: 10 }}>
        Secondary market
      </p>
      {result ? (
        <div style={{ fontSize: '0.85rem' }}>
          <p style={{ color: 'var(--success)', margin: 0 }}>
            ✓ Real ask placed on-chain — order <code className="mono">{result.orderId.slice(0, 12)}…</code>.{' '}
            <a href="/market">View the order book →</a>
          </p>
          {result.depositTransactionId && (
            <p style={{ color: 'var(--success)', marginTop: 6 }}>✓ Unit escrowed to the market contract — this order can now actually fill.</p>
          )}
          {result.depositError && (
            <p role="alert" style={{ marginTop: 6 }}>
              Listed, but escrow deposit failed: {result.depositError} — this order will revert on fill until deposited.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={priceUSD}
            onChange={(e) => setPriceUSD(e.target.value)}
            placeholder="Ask price (USD)"
            style={{ margin: 0, width: 160 }}
          />
          <button className="secondary" onClick={handlePlace} disabled={placing}>
            {placing ? <span className="spinner" /> : 'List on secondary market'}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
