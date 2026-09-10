import { Fragment } from 'react';
import { getPlatformStats } from '@/lib/business';
import CountUp from './CountUp';
import HeroVisual from './HeroVisual';
import { BookIcon, CardIcon, ChainIcon, ChartIcon, ClockIcon, CoinIcon, LockIcon, ShieldIcon, StoreIcon } from './Icons';

const PIPELINE = [
  { icon: <StoreIcon size={18} />, label: 'Business', sub: 'Real revenue' },
  { icon: <CardIcon size={18} />, label: 'Stripe', sub: 'Connect + sync' },
  { icon: <LockIcon size={18} />, label: 'Chainlink CRE', sub: 'Read privately' },
  { icon: <ShieldIcon size={18} />, label: 'Confidential TEE', sub: 'Verdict only' },
  { icon: <ChainIcon size={18} />, label: 'Hedera ATS', sub: 'Bond issued' },
  { icon: <ClockIcon size={18} />, label: 'Scheduled', sub: 'No keeper' },
  { icon: <ChartIcon size={18} />, label: 'The Graph', sub: 'Public record' },
];

const FEATURES = [
  {
    icon: <LockIcon size={20} />,
    title: 'Underwritten in private',
    body: "A business's real revenue is read once, inside a Chainlink Confidential Workflow's TEE. Only a verdict — approve or decline, and a coupon rate — ever leaves the enclave.",
  },
  {
    icon: <CoinIcon size={20} />,
    title: 'Issued as a real bond',
    body: "That verdict sets the coupon rate on a bond issued through Hedera's Asset Tokenization Studio — a real fixed-rate instrument, not a token invented for a demo.",
  },
  {
    icon: <ClockIcon size={20} />,
    title: 'Settles itself',
    body: 'Coupons and redemption fire on real Hedera Scheduled Transactions — no keeper bot, no cron job, no human watching a calendar.',
  },
  {
    icon: <BookIcon size={20} />,
    title: 'Priced in public',
    body: "Every issuer's repayment history is indexed by a Graph subgraph into a public, queryable register — credit earned by repayment, not by paperwork.",
  },
];

export default function HomePage() {
  const stats = getPlatformStats();
  const totalFaceValueUsd = Number(BigInt(stats.totalFaceValueUsdMicros) / 1_000_000n);

  return (
    <main className="page-wide">
      <div className="hero">
        <div className="hero-content">
          <div className="eyebrow fade-up" style={{ ['--stagger' as string]: 0 }}>
            <span className="eyebrow-dot" />
            ETHOnline 2026 · Hedera · Chainlink · The Graph
          </div>
          <h1 className="fade-up" style={{ ['--stagger' as string]: 1 }}>
            A shop&apos;s verified revenue becomes a <span className="accent-text">short bond</span>.
          </h1>
          <p className="hero-sub fade-up" style={{ ['--stagger' as string]: 2 }}>
            Underwritten in private, priced in public, settles itself. Chainlink reads the revenue privately and sets the
            rate. Hedera issues the bond and pays it back on its own schedule. The Graph makes every issuer&apos;s track
            record public.
          </p>
          <div className="hero-cta fade-up" style={{ ['--stagger' as string]: 3 }}>
            <a className="button-link" href="/register">
              Register your business →
            </a>
            <a className="button-link secondary" href="/dashboard">
              View the dashboard
            </a>
          </div>
          <div className="sponsor-strip fade-up" style={{ ['--stagger' as string]: 4 }}>
            <span className="sponsor-chip">
              <span className="dot" style={{ background: '#8259ef' }} /> Hedera ATS
            </span>
            <span className="sponsor-chip">
              <span className="dot" style={{ background: '#4a7cf7' }} /> Chainlink CRE
            </span>
            <span className="sponsor-chip">
              <span className="dot" style={{ background: '#8b6df0' }} /> The Graph
            </span>
          </div>
        </div>

        <div className="fade-up" style={{ ['--stagger' as string]: 2 }}>
          <HeroVisual />
        </div>
      </div>

      <div className="stat-grid">
        {[
          { label: 'Businesses registered', value: stats.totalBusinesses },
          { label: 'Bonds issued', value: stats.bondsIssued },
          { label: 'Total face value', value: totalFaceValueUsd, prefix: '$' },
          { label: 'Transactions synced', value: stats.totalTransactions },
        ].map((s, i) => (
          <div className="stat-card fade-up" key={s.label} style={{ ['--stagger' as string]: i }}>
            <p className="stat-label">{s.label}</p>
            <p className="stat">
              <CountUp value={s.value} prefix={s.prefix} />
            </p>
          </div>
        ))}
      </div>

      <div className="section-heading">
        <h2>How it works</h2>
        <p className="section-sub">Seven steps, every one of them real infrastructure</p>
      </div>
      <div className="pipeline-flow">
        {PIPELINE.map((step, i) => (
          <Fragment key={step.label}>
            <div className="pipeline-node fade-up" style={{ ['--stagger' as string]: i }}>
              <span className="icon">{step.icon}</span>
              <div className="label">{step.label}</div>
              <div className="sub">{step.sub}</div>
            </div>
            {i < PIPELINE.length - 1 && (
              <div className="pipeline-arrow" style={{ ['--stagger' as string]: i }}>
                →
              </div>
            )}
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
