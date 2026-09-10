import { Fragment } from 'react';
import { getPlatformStats } from '@/lib/business';
import CountUp from './CountUp';

const PIPELINE = [
  { icon: '🏪', label: 'Business', sub: 'Real revenue' },
  { icon: '💳', label: 'Stripe', sub: 'Connect + sync' },
  { icon: '🔒', label: 'Chainlink CRE', sub: 'Read privately' },
  { icon: '🛡️', label: 'Confidential TEE', sub: 'Verdict only' },
  { icon: '⛓️', label: 'Hedera ATS', sub: 'Bond issued' },
  { icon: '⏱️', label: 'Scheduled', sub: 'No keeper' },
  { icon: '📊', label: 'The Graph', sub: 'Public record' },
];

const FEATURES = [
  {
    icon: '🔐',
    title: 'Underwritten in private',
    body: "A business's real revenue is read once, inside a Chainlink Confidential Workflow's TEE. Only a verdict — approve/decline, coupon rate — ever leaves the enclave.",
  },
  {
    icon: '🪙',
    title: 'Issued as a real bond',
    body: "That verdict sets the coupon rate on a bond issued through Hedera's Asset Tokenization Studio — a real fixed-rate instrument, not a token invented for the demo.",
  },
  {
    icon: '⏰',
    title: 'Settles itself',
    body: 'Coupons and redemption fire on real Hedera Scheduled Transactions — no keeper bot, no cron job, no human watching a calendar.',
  },
  {
    icon: '📖',
    title: 'Priced in public',
    body: "Every issuer's repayment history is indexed by a Graph subgraph into a public, queryable performance register — credit earned by repayment, not paperwork.",
  },
];

export default function HomePage() {
  const stats = getPlatformStats();
  const totalFaceValueUsd = Number(BigInt(stats.totalFaceValueUsdMicros) / 1_000_000n);

  return (
    <main className="page-wide">
      <section className="hero">
        <div className="hero-blob a" />
        <div className="hero-blob b" />
        <div className="hero-content">
          <div className="eyebrow fade-up" style={{ ['--stagger' as string]: 0 }}>
            <span className="eyebrow-dot" />
            ETHOnline 2026 — Hedera · Chainlink · The Graph
          </div>
          <h1 className="fade-up" style={{ ['--stagger' as string]: 1 }}>
            A shop&apos;s verified revenue becomes a <span className="accent-text">short bond</span>.
          </h1>
          <p className="hero-sub fade-up" style={{ ['--stagger' as string]: 2 }}>
            Underwritten in private, priced in public, settles itself. Chainlink reads the revenue privately and sets
            the rate. Hedera issues the bond and pays it back on its own schedule. The Graph makes every issuer&apos;s
            track record public and comparable.
          </p>
          <div className="hero-cta fade-up" style={{ ['--stagger' as string]: 3 }}>
            <a className="button-link" href="/register">
              Register your business
            </a>
            <a className="button-link" href="/dashboard" style={{ background: 'transparent', color: 'var(--accent)', border: '1px solid var(--border)' }}>
              View the dashboard
            </a>
          </div>
          <div className="sponsor-strip fade-up" style={{ ['--stagger' as string]: 4 }}>
            <span className="sponsor-chip">
              <span className="dot" style={{ background: '#8247e5' }} /> Hedera ATS
            </span>
            <span className="sponsor-chip">
              <span className="dot" style={{ background: '#375bd2' }} /> Chainlink CRE
            </span>
            <span className="sponsor-chip">
              <span className="dot" style={{ background: '#6747ed' }} /> The Graph
            </span>
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <div className="stat-card fade-up" style={{ ['--stagger' as string]: 0 }}>
          <p className="stat-label">Businesses registered</p>
          <p className="stat">
            <CountUp value={stats.totalBusinesses} />
          </p>
        </div>
        <div className="stat-card fade-up" style={{ ['--stagger' as string]: 1 }}>
          <p className="stat-label">Bonds issued</p>
          <p className="stat">
            <CountUp value={stats.bondsIssued} />
          </p>
        </div>
        <div className="stat-card fade-up" style={{ ['--stagger' as string]: 2 }}>
          <p className="stat-label">Total face value</p>
          <p className="stat">
            <CountUp value={totalFaceValueUsd} prefix="$" />
          </p>
        </div>
        <div className="stat-card fade-up" style={{ ['--stagger' as string]: 3 }}>
          <p className="stat-label">Real transactions synced</p>
          <p className="stat">
            <CountUp value={stats.totalTransactions} />
          </p>
        </div>
      </div>

      <div className="section-heading">
        <h2>How it works</h2>
      </div>
      <div className="pipeline-flow">
        {PIPELINE.map((step, i) => (
          <Fragment key={step.label}>
            <div className="pipeline-node fade-up" style={{ ['--stagger' as string]: i }}>
              <span className="icon">{step.icon}</span>
              <div className="label">{step.label}</div>
              <div className="sub">{step.sub}</div>
            </div>
            {i < PIPELINE.length - 1 && <div className="pipeline-arrow">→</div>}
          </Fragment>
        ))}
      </div>

      <div className="section-heading">
        <h2>Why it&apos;s real, not a demo trick</h2>
      </div>
      <div className="feature-grid">
        {FEATURES.map((f, i) => (
          <div className="feature-card fade-up" key={f.title} style={{ ['--stagger' as string]: i }}>
            <span className="icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
