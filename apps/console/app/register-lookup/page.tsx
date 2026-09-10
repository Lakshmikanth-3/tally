import { listAllLifecycleEvents } from '@/lib/subgraph';
import { hashscanAccount } from '@/lib/explorer';

const KIND_LABEL: Record<string, string> = {
  issued: 'Issued',
  coupon: 'Coupon',
  resale: 'Resale',
  redeemed: 'Redeemed',
  defaulted: 'Defaulted',
};

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

/// Reads the real, live-deployed Graph subgraph directly — the same
/// public register a lender could query before extending credit to an
/// issuer, without leaving the console to use Studio's own playground.
export default async function RegisterLookupPage() {
  let events: Awaited<ReturnType<typeof listAllLifecycleEvents>>['events'] = [];
  let standings: Awaited<ReturnType<typeof listAllLifecycleEvents>>['standings'] = [];
  let loadError: string | null = null;
  try {
    const data = await listAllLifecycleEvents();
    events = data.events;
    standings = data.standings;
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <main className="page-wide">
      <div className="fade-up" style={{ ['--stagger' as string]: 0, paddingTop: 40 }}>
        <h1>Issuer repayment register</h1>
        <p style={{ maxWidth: 680 }}>
          The public, queryable record every issuer&apos;s on-time/late history lives in — read live from the deployed
          Graph subgraph on every load, same query shape regardless of which issuer you&apos;re looking at. Mirrored onto
          Ethereum Sepolia at the same deterministic addresses as the real Hedera deployment, purely because Subgraph
          Studio doesn&apos;t support Hedera as an indexable network.
        </p>
      </div>

      {loadError && <p role="alert">Could not reach the subgraph: {loadError}</p>}

      {!loadError && (
        <>
          <div className="section-heading" style={{ marginTop: 40 }}>
            <h2>Issuer standings</h2>
          </div>
          {standings.length === 0 ? (
            <div className="empty-state">
              <p>No issuer standings indexed yet.</p>
            </div>
          ) : (
            <div className="biz-grid">
              {standings.map((s) => (
                <div className="biz-card" key={s.id} style={{ cursor: 'default' }}>
                  <h3 className="mono" style={{ fontSize: '0.85rem' }}>
                    <a href={hashscanAccount(s.id)} target="_blank" rel="noreferrer">
                      {s.id.slice(0, 10)}…{s.id.slice(-6)} ↗
                    </a>
                  </h3>
                  <div className="pill-row">
                    <span className="pill">{s.bondsIssued} bond{s.bondsIssued === 1 ? '' : 's'} issued</span>
                    <span className="pill pill-issued">{s.couponsOnTime} on-time</span>
                    {s.couponsLate > 0 && <span className="pill pill-declined">{s.couponsLate} late</span>}
                    {s.defaults > 0 && <span className="pill pill-declined">{s.defaults} default{s.defaults === 1 ? '' : 's'}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="section-heading" style={{ marginTop: 52 }}>
            <h2>Lifecycle events</h2>
            <p className="section-sub">Real anchored events, newest first</p>
          </div>
          {events.length === 0 ? (
            <div className="empty-state">
              <p>No lifecycle events anchored yet.</p>
            </div>
          ) : (
            <div className="table-scroll" style={{ marginTop: 20 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>When</th>
                    <th>On time</th>
                    <th>Bond</th>
                    <th>HCS ref</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td style={{ color: 'var(--text)' }}>{KIND_LABEL[e.kind] ?? e.kind}</td>
                      <td>{formatDate(e.timestamp)}</td>
                      <td>{e.onTime === null ? '—' : e.onTime ? '✓ Yes' : '✕ Late'}</td>
                      <td className="mono">{e.bond.id.slice(0, 10)}…</td>
                      <td className="mono">{e.hcsTxId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
