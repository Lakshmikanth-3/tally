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

/// What this button actually does, in order. Deliberately NOT labelled
/// "Chainlink CRE ✓ / Confidential TEE ✓": this request runs the
/// underwriting policy in Tally's own backend. The CRE workflow runs the
/// *identical* policy (same @tally/underwriting package) against this same
/// authenticated revenue API inside a real TEE, but it runs on its own
/// trigger, not synchronously on this click — claiming otherwise here
/// would misrepresent the architecture to anyone watching.
const RUN_STEPS = [
  'Revenue snapshot computed',
  'Underwriting policy applied',
  'Verdict returned',
];

const ISSUE_STEP = 'Hedera ATS issuance';

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

/// The live pipeline. The whole flow is a single long HTTP request, so
/// while it's in flight the steps advance on a timer as a progress
/// indication — they are not per-step confirmations from the server, and
/// nothing is marked complete once the real outcome is known unless it
/// actually happened (a declined run never shows issuance as done).
function RunPipeline({ running, outcome }: { running: boolean; outcome: 'approved' | 'declined' | null }) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!running) return;
    setActiveStep(0);
    const timer = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, RUN_STEPS.length));
    }, 2200);
    return () => clearInterval(timer);
  }, [running]);

  const resolved = !running && outcome !== null;
  // Issuance only ever happened on an approval — a decline stops at the verdict.
  const issueState = resolved ? (outcome === 'approved' ? 'done' : 'skipped') : running ? 'pending' : 'pending';

  return (
    <div className="run-pipeline">
      {RUN_STEPS.map((step, i) => {
        const done = resolved || (running && i < activeStep);
        const active = running && i === activeStep;
        return (
          <div key={step} className={`run-step${done ? ' done' : ''}${active ? ' active' : ''}`}>
            <span className="marker">{done ? '✓' : active ? <span className="spinner" /> : i + 1}</span>
            {step}
          </div>
        );
      })}

      <div className={`run-step${issueState === 'done' ? ' done' : ''}${running && activeStep >= RUN_STEPS.length ? ' active' : ''}`}>
        <span className="marker">
          {issueState === 'done' ? '✓' : issueState === 'skipped' ? '–' : running && activeStep >= RUN_STEPS.length ? <span className="spinner" /> : RUN_STEPS.length + 1}
        </span>
        {ISSUE_STEP}
        {issueState === 'skipped' && <span style={{ color: 'var(--text-dim)' }}> — not reached (declined)</span>}
        {!resolved && <span style={{ color: 'var(--text-dim)' }}> — only if approved</span>}
      </div>

      {outcome === 'approved' && <div className="verdict-line approved">APPROVED</div>}
      {outcome === 'declined' && <div className="verdict-line declined">DECLINED</div>}

      <div className="run-note">
        🔒 The raw revenue figure is never returned by this call — only the verdict and coupon rate.
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: '10px 0 0' }}>
        This run applies the underwriting policy in Tally&apos;s backend. The Chainlink CRE workflow runs the identical
        policy (same <code>@tally/underwriting</code> package) against this same authenticated revenue API from inside a
        real TEE — verified with <code>cre workflow simulate</code>; live TEE deploy is pending Chainlink&apos;s
        private-beta access review.
      </p>
    </div>
  );
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

  if (loading) {
    return (
      <section>
        <h2>Underwriting &amp; bond</h2>
        <p>Loading bond status…</p>
      </section>
    );
  }

  const outcome = bond?.status === 'issued' ? 'approved' : bond?.status === 'declined' ? 'declined' : null;

  return (
    <section className="fade-up" style={{ ['--stagger' as string]: 4 }}>
      <h2>Underwriting &amp; bond</h2>

      {(issuing || outcome) && <RunPipeline running={issuing} outcome={issuing ? null : outcome} />}

      {!bond && !issuing && (
        <>
          <p>No underwriting attempt yet. This runs the real policy over this business&apos;s real revenue snapshot.</p>
          <button onClick={handleIssue}>Run underwriting &amp; issue bond</button>
        </>
      )}

      {issuing && (
        <p style={{ fontSize: '0.86rem' }}>
          Running the real underwriting policy. If it approves, a real bond is issued on Hedera testnet — real on-chain
          transactions, roughly 15–30 seconds.
        </p>
      )}

      {bond && bond.status === 'declined' && !issuing && (
        <>
          <p role="alert">Declined: {REASON_LABELS[bond.reasonCode] ?? `reason code ${bond.reasonCode}`}</p>
          <button className="secondary" onClick={handleIssue} style={{ marginTop: 14 }}>
            Re-run underwriting
          </button>
        </>
      )}

      {bond && bond.status === 'failed' && !issuing && (
        <>
          <p role="alert">Issuance failed: {bond.errorMessage}</p>
          <button className="secondary" onClick={handleIssue} style={{ marginTop: 14 }}>
            Retry issuance
          </button>
        </>
      )}

      {bond && bond.status === 'issued' && !issuing && (
        <>
          <span className="badge-success">✓ Issued on Hedera testnet</span>
          <dl className="details">
            <dt>Coupon</dt>
            <dd>{((bond.couponBps ?? 0) / 100).toFixed(2)}%</dd>
            <dt>Face value</dt>
            <dd>${bond.faceValueUsd}</dd>
            <dt>Symbol / ISIN</dt>
            <dd>
              {bond.symbol} / {bond.isin}
            </dd>
            <dt>Bond token</dt>
            <dd>
              <a href={`https://hashscan.io/testnet/token/${bond.bondTokenId}`} target="_blank" rel="noreferrer">
                {bond.bondTokenId} ↗
              </a>
            </dd>
            <dt>Issuance tx</dt>
            <dd>
              <a href={`https://hashscan.io/testnet/transaction/${bond.transactionId}`} target="_blank" rel="noreferrer">
                {bond.transactionId} ↗
              </a>
            </dd>
            <dt>Maturity</dt>
            <dd>{bond.maturityDateSeconds ? formatDate(bond.maturityDateSeconds) : '—'}</dd>
          </dl>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 20, marginBottom: 0 }}>
            Issue Bond → Hedera ATS → Bond created → Scheduled coupons → Redemption → The Graph repayment history
            <br />
            Coupon and redemption settlement run on their own real Hedera Scheduled Transaction schedule — not triggered
            by this button.
          </p>
        </>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}
