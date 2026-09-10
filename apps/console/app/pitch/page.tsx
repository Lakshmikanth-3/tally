import { Fragment } from 'react';
import { getDb } from '@/lib/db';
import { getPlatformStats } from '@/lib/business';
import { PROOF_ENTRIES, hashscanToken, hashscanTransaction, SUBGRAPH_QUERY_URL } from '@/lib/explorer';
import { BookIcon, CardIcon, ChainIcon, ChartIcon, ClockIcon, CoinIcon, LockIcon, ShieldIcon, StoreIcon } from '../Icons';

const PIPELINE = [
  { icon: <StoreIcon />, label: 'Business', sub: 'Real revenue' },
  { icon: <CardIcon />, label: 'Stripe', sub: 'Connect + sync' },
  { icon: <LockIcon />, label: 'Chainlink CRE', sub: 'Read privately' },
  { icon: <ShieldIcon />, label: 'Confidential TEE', sub: 'Verdict only' },
  { icon: <ChainIcon />, label: 'Hedera ATS', sub: 'Bond issued' },
  { icon: <ClockIcon />, label: 'Scheduled', sub: 'No keeper' },
  { icon: <ChartIcon />, label: 'The Graph', sub: 'Public record' },
];

const FEATURES = [
  {
    icon: <LockIcon size={24} />,
    title: 'Underwritten in private',
    body: "A business's real revenue is read once, inside a Chainlink Confidential Workflow's TEE. Only a verdict — approve or decline, and a coupon rate — ever leaves the enclave.",
  },
  {
    icon: <CoinIcon size={24} />,
    title: 'Issued as a real bond',
    body: "That verdict sets the coupon rate on a bond issued through Hedera's Asset Tokenization Studio — a real fixed-rate instrument, not a token invented for a demo.",
  },
  {
    icon: <ClockIcon size={24} />,
    title: 'Settles itself',
    body: 'Coupons and redemption fire on real Hedera Scheduled Transactions — no keeper bot, no cron job, no human watching a calendar.',
  },
  {
    icon: <BookIcon size={24} />,
    title: 'Priced in public',
    body: "Every issuer's repayment history is indexed by a Graph subgraph into a public, queryable register — credit earned by repayment, not by paperwork.",
  },
];

const PROBLEM_POINTS = [
  {
    title: 'Small businesses are cash-flow rich, credit-history poor',
    body: 'A shop with a year of steady card revenue often has no bank credit history at all — traditional underwriting can’t see the thing that actually predicts repayment.',
  },
  {
    title: 'Underwriting is opaque, one-off, and manual',
    body: 'A human reads bank statements once, sets a rate once, and the process doesn’t repeat itself or get cheaper as the platform grows.',
  },
  {
    title: 'Off-chain revenue never becomes on-chain credit',
    body: 'Stripe/POS data sits in someone else’s database. There’s no trust-minimized bridge from "real revenue happened" to "a bond got priced and issued."',
  },
];

const GROUPS = ['Hedera testnet', 'Ethereum Sepolia', 'The Graph'] as const;

interface IssuedBondRow {
  issuer_id: string;
  bond_token_id: string;
  transaction_id: string;
  coupon_bps: number;
  face_value_usd: string;
  name: string;
}

/// Same real query proof/page.tsx uses — kept local (not lib/bonds.ts) so
/// this page doesn't pull in ats-client's heavy browser-runner import chain
/// just to render slide content.
function listIssuedBonds(): IssuedBondRow[] {
  return getDb()
    .prepare(
      `SELECT b.issuer_id, b.bond_token_id, b.transaction_id, b.coupon_bps, b.face_value_usd, bus.name
       FROM bonds b
       JOIN businesses bus ON bus.issuer_id = b.issuer_id
       WHERE b.status = 'issued'
       ORDER BY b.created_at DESC
       LIMIT 3`,
    )
    .all() as IssuedBondRow[];
}

function Slide({
  n,
  eyebrow,
  children,
}: {
  n: number;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pitch-slide fade-up" style={{ ['--stagger' as string]: n % 6 }}>
      <div className="pitch-slide-num">
        {String(n).padStart(2, '0')} <span className="pitch-slide-eyebrow">{eyebrow}</span>
      </div>
      {children}
    </section>
  );
}

export default function PitchPage() {
  const stats = getPlatformStats();
  const totalFaceValueUsd = Number(BigInt(stats.totalFaceValueUsdMicros) / 1_000_000n);
  const bonds = listIssuedBonds();

  return (
    <main className="page-wide pitch-deck">
      <Slide n={1} eyebrow="Tally">
        <div className="eyebrow fade-up">
          <span className="eyebrow-dot" />
          ETHOnline 2026 · Hedera · Chainlink · The Graph
        </div>
        <h1 style={{ marginTop: 18 }}>
          A shop&apos;s verified revenue becomes a <span className="accent-text">short bond</span>.
        </h1>
        <p className="hero-sub" style={{ maxWidth: 640 }}>
          Underwritten in private, priced in public, settles itself — real infrastructure, not a mocked demo. Every
          number on this page is queried live from the running app.
        </p>
        <div className="stat-grid" style={{ marginTop: 28 }}>
          {[
            { label: 'Businesses registered', value: stats.totalBusinesses },
            { label: 'Bonds issued', value: stats.bondsIssued },
            { label: 'Total face value', value: `$${totalFaceValueUsd.toLocaleString()}` },
            { label: 'Transactions synced', value: stats.totalTransactions },
          ].map((s) => (
            <div className="stat-card" key={s.label}>
              <p className="stat-label">{s.label}</p>
              <p className="stat">{s.value}</p>
            </div>
          ))}
        </div>
      </Slide>

      <Slide n={2} eyebrow="The problem">
        <h2>Why small-business credit is broken</h2>
        <div className="feature-grid" style={{ marginTop: 20 }}>
          {PROBLEM_POINTS.map((p) => (
            <div className="feature-card" key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </Slide>

      <Slide n={3} eyebrow="How it works">
        <h2>Seven steps, every one of them real infrastructure</h2>
        <div className="pipeline-flow" style={{ marginTop: 20 }}>
          {PIPELINE.map((step, i) => (
            <Fragment key={step.label}>
              <div className="pipeline-node">
                <span className="icon">{step.icon}</span>
                <div className="label">{step.label}</div>
                <div className="sub">{step.sub}</div>
              </div>
              {i < PIPELINE.length - 1 && <div className="pipeline-arrow">→</div>}
            </Fragment>
          ))}
        </div>
      </Slide>

      <Slide n={4} eyebrow="Why it's real">
        <h2>Not a demo trick</h2>
        <div className="feature-grid" style={{ marginTop: 20 }}>
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <span className="icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </Slide>

      {bonds.length > 0 && (
        <Slide n={5} eyebrow="Live evidence">
          <h2>Real bonds this instance has issued</h2>
          <p className="section-sub">Independently checkable on HashScan — nothing here is fixture data.</p>
          <div className="biz-grid" style={{ marginTop: 20 }}>
            {bonds.map((b) => (
              <div className="biz-card" key={b.bond_token_id}>
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
                      {b.transaction_id.slice(0, 18)}… ↗
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
        </Slide>
      )}

      <Slide n={bonds.length > 0 ? 6 : 5} eyebrow="Verify it yourself">
        <h2>Every claim on this page is checkable</h2>
        <p className="section-sub">Open any link — public explorers, no trust in this UI required.</p>
        {GROUPS.map((group) => (
          <div key={group}>
            <div className="section-heading" style={{ marginTop: 28 }}>
              <h3>{group}</h3>
            </div>
            <div className="proof-list">
              {PROOF_ENTRIES.filter((e) => e.group === group).map((entry) => (
                <a key={entry.value} className="proof-row" href={entry.href} target="_blank" rel="noreferrer">
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
        <p style={{ marginTop: 28 }}>
          Or query the repayment register directly at{' '}
          <a href={SUBGRAPH_QUERY_URL} target="_blank" rel="noreferrer">
            {SUBGRAPH_QUERY_URL}
          </a>
          . Full walkthrough: <a href="/proof">/proof</a> · <a href="/register-lookup">/register-lookup</a> ·{' '}
          <a href="/market">/market</a>.
        </p>
      </Slide>
    </main>
  );
}
