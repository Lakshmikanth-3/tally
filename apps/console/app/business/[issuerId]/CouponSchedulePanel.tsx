'use client';

import { useState } from 'react';

interface Props {
  issuerId: string;
  couponScheduleId: string | null;
  couponDueDateSeconds: number | null;
  couponAmountHbar: string | null;
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

/// Arms a real Hedera Scheduled Transaction for this bond's coupon — see
/// lib/coupon-schedule.ts. A separate action from issuance, not automatic
/// on issue: this is a real on-chain transaction users should trigger
/// deliberately, not one hidden inside an already multi-step issuance flow.
export default function CouponSchedulePanel({ issuerId, couponScheduleId, couponDueDateSeconds, couponAmountHbar }: Props) {
  const [armed, setArmed] = useState<{ scheduleId: string; dueDateSeconds: number; amountHbar: number } | null>(
    couponScheduleId && couponDueDateSeconds && couponAmountHbar
      ? { scheduleId: couponScheduleId, dueDateSeconds: couponDueDateSeconds, amountHbar: Number(couponAmountHbar) }
      : null,
  );
  const [arming, setArming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArm() {
    setArming(true);
    setError(null);
    try {
      const res = await fetch(`/api/business/${issuerId}/bond/coupon`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed to arm coupon schedule');
      setArmed(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setArming(false);
    }
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <p className="stat-label" style={{ marginBottom: 10 }}>
        Coupon settlement
      </p>
      {armed ? (
        <p style={{ fontSize: '0.85rem', color: 'var(--success)' }}>
          ✓ Real Hedera Scheduled Transaction armed — schedule{' '}
          <a href={`https://hashscan.io/testnet/schedule/${armed.scheduleId}`} target="_blank" rel="noreferrer">
            {armed.scheduleId} ↗
          </a>
          , pays {armed.amountHbar.toFixed(4)} ℏ at {formatDate(armed.dueDateSeconds)} — no keeper required.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>No coupon schedule armed yet for this bond.</p>
          <button className="secondary" onClick={handleArm} disabled={arming}>
            {arming ? <span className="spinner" /> : 'Arm coupon schedule'}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
