'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface BidCandidate {
  bondId: string;
  bondToken: string;
  label: string;
}

/// Places a real bid against any real issued bond — the buyer side the
/// order book never had before (every order was an ask, placed only from
/// an issuer's own business page). A bid never deposits anything: there's
/// no token to escrow until a real holder actually fills it.
export default function PlaceBidPanel({ candidates }: { candidates: BidCandidate[] }) {
  const router = useRouter();
  const [bondId, setBondId] = useState(candidates[0]?.bondId ?? '');
  const [priceUSD, setPriceUSD] = useState('');
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ orderId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  async function handlePlace() {
    setPlacing(true);
    setError(null);
    setResult(null);
    try {
      const dollars = Number(priceUSD);
      if (!Number.isFinite(dollars) || dollars <= 0) throw new Error('enter a positive price in dollars');
      const priceUSDMicros = String(Math.round(dollars * 1_000_000));
      const candidate = candidates.find((c) => c.bondId === bondId);
      if (!candidate) throw new Error('pick a bond');

      const res = await fetch('/api/market/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bondId: candidate.bondId, bondToken: candidate.bondToken, priceUSD: priceUSDMicros }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed to place bid');
      setResult(data);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <section style={{ marginTop: 40 }}>
      <h2>Place a bid</h2>
      <p style={{ fontSize: '0.87rem', maxWidth: 640 }}>
        Offer to buy any real issued bond. Unlike an ask, a bid deposits nothing up front — there&apos;s only something
        to escrow once a real holder fills it.
      </p>
      {result ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--success)', marginTop: 10 }}>
          ✓ Real bid placed on-chain — order <code className="mono">{result.orderId.slice(0, 12)}…</code>.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <select value={bondId} onChange={(e) => setBondId(e.target.value)} style={{ margin: 0 }}>
            {candidates.map((c) => (
              <option key={c.bondId} value={c.bondId}>
                {c.label}
              </option>
            ))}
          </select>
          <input value={priceUSD} onChange={(e) => setPriceUSD(e.target.value)} placeholder="Bid price (USD)" style={{ margin: 0, width: 160 }} />
          <button className="secondary" onClick={handlePlace} disabled={placing}>
            {placing ? <span className="spinner" /> : 'Place bid'}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
