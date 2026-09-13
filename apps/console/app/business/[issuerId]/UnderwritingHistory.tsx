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
          <div
            key={`${run.issuerId}-${run.createdAt}`}
            className="run-step done"
            // A failed run's real error can be an enormous single-token JSON
            // blob from the RPC relay, with nothing for the browser to break
            // on — left unwrapped it stretched this page to ~34,000px wide.
            style={{ flexWrap: 'wrap', minWidth: 0 }}
          >
            <span className={STATUS_BADGE[run.status] ?? 'badge'}>{run.status.toUpperCase()}</span>
            <span style={{ marginLeft: 10 }}>{formatDate(run.createdAt)}</span>
            <span
              style={{ marginLeft: 10, color: 'var(--text-dim)', minWidth: 0, overflowWrap: 'anywhere' }}
              title={run.status === 'failed' && run.errorMessage ? run.errorMessage : undefined}
            >
              {run.status === 'failed' && run.errorMessage
                ? summarizeError(run.errorMessage)
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

/// A real RPC failure can carry kilobytes of encoded calldata, which
/// rendered in full drowns out every other run on the page. Truncated for
/// display only — the untruncated message stays on the element's title, and
/// is never rewritten or prettified into something it didn't actually say.
const ERROR_PREVIEW_CHARS = 240;

function summarizeError(message: string): string {
  const collapsed = message.replace(/\s+/g, ' ').trim();
  return collapsed.length <= ERROR_PREVIEW_CHARS ? collapsed : `${collapsed.slice(0, ERROR_PREVIEW_CHARS)}… (hover for full error)`;
}
