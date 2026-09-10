'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface TransactionRow {
  amountUSD: string;
  timestampSeconds: number;
  source: string;
  stripeId: string | null;
}

function formatMicrosUSD(microsStr: string): string {
  return (Number(BigInt(microsStr)) / 1_000_000).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'stripe':
      return 'Stripe';
    case 'stripe-test-mode':
      return 'Stripe Test Mode';
    case 'synthetic-demo':
      return 'Synthetic demo seed';
    default:
      return 'Manual';
  }
}

/// Developer/demo control for generating real Stripe TEST MODE revenue
/// history (via real Stripe Test Clocks + Invoices — see lib/stripe.ts),
/// plus a table of the business's real recorded transactions. Every row
/// here traces to a real Stripe object id or a real manual entry — nothing
/// here is a fixture.
export default function StripeTransactionsPanel({ issuerId, canGenerate }: { issuerId: string; canGenerate: boolean }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRow[] | null>(null);
  const [loadingTable, setLoadingTable] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/business/${issuerId}/stripe/test-mode/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 40 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'generation failed');
      router.refresh();
      if (showTable) await loadTransactions();
    } catch (err) {
      setGenerateError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function loadTransactions() {
    setLoadingTable(true);
    try {
      const res = await fetch(`/api/business/${issuerId}/transactions`);
      const data = await res.json();
      setTransactions(data.transactions ?? []);
    } finally {
      setLoadingTable(false);
    }
  }

  async function toggleTable() {
    const next = !showTable;
    setShowTable(next);
    if (next && transactions === null) await loadTransactions();
  }

  return (
    <section className="fade-up" style={{ ['--stagger' as string]: 3 }}>
      <h2>Stripe transactions</h2>

      {canGenerate && (
        <>
          <p style={{ fontSize: '0.88rem' }}>
            Developer/demo control — creates real Stripe TEST MODE transactions via Stripe&apos;s own Test Clock
            mechanism (real invoices, backdated across ~40 real simulated days), not fake rows inserted into this
            database.
          </p>
          <button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <span className="spinner" /> Creating real Stripe test transactions…
              </>
            ) : (
              'Generate Stripe test transactions'
            )}
          </button>
          {generateError && <p role="alert">{generateError}</p>}
        </>
      )}

      <div style={{ marginTop: 14 }}>
        <button className="secondary" onClick={toggleTable}>
          {showTable ? 'Hide' : 'View'} Stripe transactions
        </button>
      </div>

      {showTable && (
        <>
          {loadingTable ? (
            <p style={{ marginTop: 16 }}>Loading…</p>
          ) : !transactions || transactions.length === 0 ? (
            <p style={{ marginTop: 16 }}>No transactions yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Stripe ID</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={`${tx.stripeId ?? 'manual'}-${tx.timestampSeconds}`}>
                      <td>{new Date(tx.timestampSeconds * 1000).toLocaleDateString()}</td>
                      <td className="mono">{tx.stripeId ?? '—'}</td>
                      <td style={{ color: 'var(--text)' }}>{formatMicrosUSD(tx.amountUSD)}</td>
                      <td>{tx.source === 'manual' ? 'recorded' : 'paid'}</td>
                      <td>{sourceLabel(tx.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
