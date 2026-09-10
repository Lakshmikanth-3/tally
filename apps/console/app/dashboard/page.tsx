import Link from 'next/link';
import { getPlatformStats, listAllBusinesses } from '@/lib/business';
import CountUp from '../CountUp';

function pillForBond(status: string): { className: string; label: string } {
  switch (status) {
    case 'issued':
      return { className: 'pill pill-issued', label: '● Bond issued' };
    case 'declined':
      return { className: 'pill pill-declined', label: '● Declined' };
    case 'failed':
      return { className: 'pill pill-declined', label: '● Issuance failed' };
    default:
      return { className: 'pill', label: '○ No bond yet' };
  }
}

export default function DashboardPage() {
  const businesses = listAllBusinesses();
  const stats = getPlatformStats();
  const totalFaceValueUsd = Number(BigInt(stats.totalFaceValueUsdMicros) / 1_000_000n);

  return (
    <main className="page-wide">
      <div className="fade-up" style={{ ['--stagger' as string]: 0, paddingTop: 40 }}>
        <h1>Dashboard</h1>
        <p>Every business on Tally, its real Stripe connection state, and its latest real bond attempt.</p>
      </div>

      <div className="stat-grid">
        {[
          { label: 'Businesses', value: stats.totalBusinesses },
          { label: 'Bonds issued', value: stats.bondsIssued },
          { label: 'Total face value', value: totalFaceValueUsd, prefix: '$' },
          { label: 'Transactions synced', value: stats.totalTransactions },
        ].map((s, i) => (
          <div className="stat-card fade-up" key={s.label} style={{ ['--stagger' as string]: i + 1 }}>
            <p className="stat-label">{s.label}</p>
            <p className="stat">
              <CountUp value={s.value} prefix={s.prefix} />
            </p>
          </div>
        ))}
      </div>

      <div className="section-heading" style={{ marginTop: 20 }}>
        <h2>Businesses</h2>
        <a className="button-link secondary" href="/register">
          + Register new
        </a>
      </div>

      {businesses.length === 0 ? (
        <div className="empty-state">
          <p>No businesses registered yet.</p>
          <a className="button-link" href="/register">
            Register the first one
          </a>
        </div>
      ) : (
        <div className="biz-grid">
          {businesses.map((b, i) => {
            const bondPill = pillForBond(b.bondStatus);
            return (
              <Link
                key={b.issuerId}
                href={`/business/${b.issuerId}`}
                className="biz-card fade-up"
                style={{ ['--stagger' as string]: i }}
              >
                <h3>{b.name}</h3>
                <div className="issuer-id">{b.issuerId}</div>
                <div className="pill-row">
                  {b.isDemo && <span className="pill pill-demo">Synthetic demo</span>}
                  <span className={b.stripeConnected ? 'pill pill-issued' : 'pill'}>
                    {b.stripeConnected ? '✓ Stripe' : 'No Stripe'}
                  </span>
                  <span className={bondPill.className}>{bondPill.label}</span>
                  {b.couponBps != null && b.bondStatus === 'issued' && (
                    <span className="pill">{(b.couponBps / 100).toFixed(2)}% coupon</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
