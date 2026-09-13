'use client';

import { useEffect, useState } from 'react';

interface CouponPayment {
  couponIndex: number;
  dueDateSeconds: number;
  amountHbar: string | null;
  scheduleId: string | null;
  anchoredAt: number | null;
  anchorTxId: string | null;
  anchoredOnTime: boolean | null;
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

/// Shows a bond's real coupon schedule — one row per payment it owes — and
/// arms whichever coupons have come inside Hedera's ~60-day scheduling
/// window. A multi-coupon bond arms progressively rather than all at once,
/// so this is safe (and expected) to run more than once over a bond's life;
/// the background sweep (lib/lifecycle.ts) does the same thing on a timer.
export default function CouponSchedulePanel({ issuerId }: { issuerId: string }) {
  const [payments, setPayments] = useState<CouponPayment[] | null>(null);
  const [arming, setArming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch(`/api/business/${issuerId}/bond/coupon`);
      const data = await res.json();
      if (res.ok) setPayments(data.payments ?? []);
    } catch {
      // A failed refresh leaves the last real state on screen rather than
      // replacing it with a guess.
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuerId]);

  async function handleArm() {
    setArming(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/business/${issuerId}/bond/coupon`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed to arm coupon schedule');
      setNote(`Armed ${data.armed?.length ?? 0} coupon payment(s) on Hedera.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setArming(false);
    }
  }

  const unarmed = (payments ?? []).filter((p) => p.scheduleId === null).length;

  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <p className="stat-label" style={{ marginBottom: 10 }}>
        Coupon schedule
      </p>

      {payments === null && <p style={{ fontSize: '0.85rem' }}>Loading coupon schedule…</p>}

      {payments !== null && payments.length === 0 && (
        <p style={{ fontSize: '0.85rem' }}>No coupon schedule planned for this bond yet.</p>
      )}

      {payments !== null && payments.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Due</th>
                <th>Amount</th>
                <th>Scheduled</th>
                <th>Paid &amp; anchored</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.couponIndex}>
                  <td>{p.couponIndex}</td>
                  <td>{formatDate(p.dueDateSeconds)}</td>
                  <td>{p.amountHbar ? `${Number(p.amountHbar).toFixed(4)} ℏ` : '—'}</td>
                  <td>
                    {p.scheduleId ? (
                      <a href={`https://hashscan.io/testnet/schedule/${p.scheduleId}`} target="_blank" rel="noreferrer">
                        {p.scheduleId} ↗
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>not yet armed</span>
                    )}
                  </td>
                  <td>
                    {p.anchoredAt ? (
                      <span style={{ color: p.anchoredOnTime ? 'var(--success)' : 'var(--danger)' }}>
                        ✓ {p.anchoredOnTime ? 'on time' : 'late'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unarmed > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <button className="secondary" onClick={handleArm} disabled={arming}>
            {arming ? <span className="spinner" /> : `Arm schedulable coupons (${unarmed} unarmed)`}
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Hedera only accepts schedules ~60 days out, so later coupons arm automatically as they come into range.
          </span>
        </div>
      )}

      {note && <p style={{ fontSize: '0.85rem', color: 'var(--success)' }}>{note}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
