import { UnderwritingReasonCode } from '@tally/seam';
import { listBondsForIssuer } from '@/lib/bonds';

const REASON_LABELS: Record<UnderwritingReasonCode, string> = {
  [UnderwritingReasonCode.APPROVED]: 'Approved',
  [UnderwritingReasonCode.REVENUE_BELOW_THRESHOLD]: 'Revenue below the $3,000 trailing-90-day threshold',
  [UnderwritingReasonCode.INSUFFICIENT_HISTORY]: 'Fewer than 30 days of revenue history',
  [UnderwritingReasonCode.VOLATILITY_TOO_HIGH]: 'Revenue volatility too high',
  [UnderwritingReasonCode.ISSUER_HAS_OPEN_DEFAULT]: 'Issuer has an open default',
};

const STATUS_BADGE: Record<string, string> = {
  issued: 'badge-success',
  declined: 'badge',
  failed: 'badge',
};

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

/// Every real underwriting run this issuer has ever triggered — the bonds
/// table already records one row per run (never overwritten), so a re-run
/// after 30+ days of revenue shows up as a second, independent verdict
/// rather than replacing the first one.
export default function UnderwritingHistory({ issuerId }: { issuerId: string }) {
  const runs = listBondsForIssuer(issuerId);
  if (runs.length <= 1) return null; // BondPanel already shows the single/latest run — avoid a redundant one-row history

  return (
    <section className="fade-up" style={{ ['--stagger' as string]: 6 }}>
      <h2>Underwriting history</h2>
      <p style={{ fontSize: '0.87rem', maxWidth: 640 }}>
        Every real run of the underwriting policy against this business&apos;s revenue, oldest verdict first below the
        most recent.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10 }}>
        {runs.map((run) => (
          <div key={`${run.issuerId}-${run.createdAt}`} className="run-step done">
            <span className={STATUS_BADGE[run.status] ?? 'badge'}>{run.status.toUpperCase()}</span>
            <span style={{ marginLeft: 10 }}>{formatDate(run.createdAt)}</span>
            <span style={{ marginLeft: 10, color: 'var(--text-dim)' }}>
              {run.status === 'failed' && run.errorMessage
                ? run.errorMessage
                : (REASON_LABELS[run.reasonCode as UnderwritingReasonCode] ?? `reason code ${run.reasonCode}`)}
            </span>
            {run.status === 'issued' && run.couponBps !== null && (
              <span style={{ marginLeft: 10 }}>· {(run.couponBps / 100).toFixed(2)}% coupon</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
