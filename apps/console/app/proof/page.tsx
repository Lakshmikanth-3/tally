import { getDb } from '@/lib/db';
import { PROOF_ENTRIES, hashscanToken, hashscanTransaction, SUBGRAPH_QUERY_URL } from '@/lib/explorer';

interface IssuedBondRow {
  issuer_id: string;
  bond_token_id: string;
  evm_diamond_address: string;
  transaction_id: string;
  coupon_bps: number;
  face_value_usd: string;
  created_at: number;
  name: string;
}

/// Every real bond this instance has actually issued, newest first — each
/// one independently checkable on HashScan.
function listIssuedBonds(): IssuedBondRow[] {
  return getDb()
    .prepare(
      `SELECT b.issuer_id, b.bond_token_id, b.evm_diamond_address, b.transaction_id,
              b.coupon_bps, b.face_value_usd, b.created_at, bus.name
       FROM bonds b
       JOIN businesses bus ON bus.issuer_id = b.issuer_id
       WHERE b.status = 'issued'
       ORDER BY b.created_at DESC`,
    )
    .all() as IssuedBondRow[];
}

const GROUPS = ['Hedera testnet', 'Ethereum Sepolia', 'The Graph'] as const;

const SAMPLE_QUERY = `{
  lifecycleEvents(first: 10, orderBy: timestamp, orderDirection: desc) {
    kind
    timestamp
    onTime
    hcsTxId
    bond { issuer }
  }
  issuerStandings {
    id
    bondsIssued
    couponsOnTime
    couponsLate
  }
}`;

export default function ProofPage() {
  const bonds = listIssuedBonds();

  return (
    <main className="page-wide">
      <div className="fade-up" style={{ ['--stagger' as string]: 0, paddingTop: 40 }}>
        <h1>Verify on-chain</h1>
        <p style={{ maxWidth: 680 }}>
          Every claim Tally makes is checkable without trusting this interface. Each link below opens a public block
          explorer or a live GraphQL endpoint.
        </p>
      </div>

      {bonds.length > 0 && (
        <>
          <div className="section-heading" style={{ marginTop: 40 }}>
            <h2>Bonds issued by this instance</h2>
            <p className="section-sub">Real tokens deployed through Hedera&apos;s ATS factory</p>
          </div>
          <div className="biz-grid">
            {bonds.map((b, i) => (
              <div className="biz-card" key={b.bond_token_id} style={{ ['--stagger' as string]: i }}>
                <h3>{b.name}</h3>
                <div className="issuer-id">{b.issuer_id}</div>
                <dl className="details" style={{ marginTop: 16 }}>
                  <dt>Token</dt>
                  <dd>
                    <a href={hashscanToken(b.bond_token_id)} target="_blank" rel="noreferrer">
                      {b.bond_token_id} ↗
                    </a>
                  </dd>
                  <dt>Tx</dt>
                  <dd>
                    <a href={hashscanTransaction(b.transaction_id)} target="_blank" rel="noreferrer">
                      {b.transaction_id.slice(0, 20)}… ↗
                    </a>
                  </dd>
                  <dt>Coupon</dt>
                  <dd>{(b.coupon_bps / 100).toFixed(2)}%</dd>
                  <dt>Face value</dt>
                  <dd>${b.face_value_usd}</dd>
                </dl>
              </div>
            ))}
          </div>
        </>
      )}

      {GROUPS.map((group, gi) => (
        <div key={group}>
          <div className="section-heading" style={{ marginTop: 52 }}>
            <h2>{group}</h2>
          </div>
          <div className="proof-list">
            {PROOF_ENTRIES.filter((e) => e.group === group).map((entry, i) => (
              <a
                key={entry.value}
                className="proof-row fade-up"
                href={entry.href}
                target="_blank"
                rel="noreferrer"
                style={{ ['--stagger' as string]: gi + i }}
              >
                <div className="proof-main">
                  <div className="proof-label">{entry.label}</div>
                  <div className="proof-value">{entry.value}</div>
                  <div className="proof-note">{entry.note}</div>
                </div>
                <span className="proof-arrow">↗</span>
              </a>
            ))}
          </div>
        </div>
      ))}

      <div className="section-heading" style={{ marginTop: 52 }}>
        <h2>Query the register yourself</h2>
      </div>
      <section>
        <p>
          Paste this into the{' '}
          <a href={SUBGRAPH_QUERY_URL} target="_blank" rel="noreferrer">
            Studio playground
          </a>{' '}
          to read the real indexed repayment history:
        </p>
        <pre className="code-block">{SAMPLE_QUERY}</pre>
      </section>
    </main>
  );
}
