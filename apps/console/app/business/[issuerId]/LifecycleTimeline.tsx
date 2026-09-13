import { listLifecycleEventsForBond } from '@/lib/subgraph';

const KIND_LABEL: Record<string, string> = {
  issued: 'Issued',
  coupon: 'Coupon paid',
  resale: 'Resold',
  redeemed: 'Redeemed',
  defaulted: 'Defaulted',
};

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

/// Real anchored lifecycle events for one specific bond, read live from
/// the deployed subgraph — honestly empty if none have been anchored,
/// which is the real state for most bonds: coupon/redemption anchoring is
/// armed separately via packages/scheduler on its own real Hedera
/// Scheduled Transaction, not triggered automatically by issuance.
export default async function LifecycleTimeline({ bondId }: { bondId: string }) {
  let events: Awaited<ReturnType<typeof listLifecycleEventsForBond>> = [];
  let loadError: string | null = null;
  try {
    events = await listLifecycleEventsForBond(bondId);
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <section className="fade-up" style={{ ['--stagger' as string]: 5 }}>
      <h2>Lifecycle timeline</h2>
      {loadError && <p role="alert">Could not reach the subgraph: {loadError}</p>}
      {!loadError && events.length === 0 && (
        <p style={{ fontSize: '0.87rem' }}>
          Nothing indexed for this bond yet — which does <strong>not</strong> mean nothing was anchored. This timeline
          reads the subgraph, and the subgraph indexes the <em>Sepolia</em> copy of <code>SettlementAnchor</code>,
          because Subgraph Studio can&apos;t index Hedera (see <code>FEEDBACK/THEGRAPH.md</code>). Real settlement
          anchors written to the Hedera deployment — the ones the coupon schedule above links — therefore never show up
          here. Check the coupon schedule for this bond&apos;s real anchored payments, or{' '}
          <a href="/register-lookup">the repayment register</a> for what the subgraph has actually indexed.
        </p>
      )}
      {!loadError && events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {events.map((e) => (
            <div key={e.id} className="run-step done">
              <span className="marker">✓</span>
              <span style={{ color: 'var(--text)', fontWeight: 590, marginRight: 8 }}>{KIND_LABEL[e.kind] ?? e.kind}</span>
              {formatDate(e.timestamp)}
              {e.onTime !== null && (
                <span style={{ marginLeft: 8, color: e.onTime ? 'var(--success)' : 'var(--danger)' }}>
                  {e.onTime ? '· on time' : '· late'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
