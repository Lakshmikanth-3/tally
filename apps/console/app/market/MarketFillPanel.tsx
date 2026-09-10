'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/// Attempts a real fill against the real deployed SecondaryMarket
/// contract. Defaults to Tally's own custodian key server-side if no
/// taker key is supplied — pasting a different account's real private key
/// here fills as that account instead, for demonstrating the real
/// compliance path against a genuinely different signer.
export default function MarketFillPanel({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [takerKey, setTakerKey] = useState('');
  const [filling, setFilling] = useState(false);
  const [result, setResult] = useState<{ success: boolean; revertReason: string | null } | null>(null);

  async function handleFill() {
    setFilling(true);
    setResult(null);
    try {
      const res = await fetch(`/api/market/orders/${orderId}/fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(takerKey ? { takerPrivateKeyHex: takerKey } : {}),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) router.refresh();
    } catch (err) {
      setResult({ success: false, revertReason: (err as Error).message });
    } finally {
      setFilling(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="secondary" onClick={handleFill} disabled={filling} style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
          {filling ? <span className="spinner" /> : 'Attempt fill'}
        </button>
        <button
          className="secondary"
          onClick={() => setShowKeyInput((s) => !s)}
          style={{ padding: '6px 10px', fontSize: '0.78rem' }}
          title="Fill as a different account instead of Tally's custodian"
        >
          ⚙
        </button>
      </div>
      {showKeyInput && (
        <input
          value={takerKey}
          onChange={(e) => setTakerKey(e.target.value)}
          placeholder="Taker private key (optional)"
          style={{ margin: 0, fontSize: '0.75rem', padding: '6px 8px' }}
        />
      )}
      {result && (
        <p style={{ fontSize: '0.72rem', color: result.success ? 'var(--success)' : 'var(--danger)', margin: 0, maxWidth: 260, wordBreak: 'break-word' }}>
          {result.success ? '✓ Filled' : result.revertReason?.match(/counterparty not compliant/) ? 'Reverted: not ATS-compliant' : `Reverted: ${result.revertReason?.slice(0, 120)}`}
        </p>
      )}
    </div>
  );
}
