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
          No lifecycle events anchored for this bond yet. Coupon and redemption anchoring is armed separately, on a real
          Hedera Scheduled Transaction (<code>packages/scheduler</code>) — issuance alone doesn&apos;t create one. See{' '}
          <a href="/register-lookup">the full repayment register</a> for events already anchored on other bonds.
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
