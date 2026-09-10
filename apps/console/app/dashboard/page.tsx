import Link from 'next/link';
import { getPlatformStats, listAllBusinesses } from '@/lib/business';
import CountUp from '../CountUp';

function pillForBond(status: string): { className: string; label: string } {
  switch (status) {
    case 'issued':
      return { className: 'pill pill-issued', label: 'Bond issued' };
    case 'declined':
      return { className: 'pill pill-declined', label: 'Declined' };
    case 'failed':
      return { className: 'pill pill-declined', label: 'Issuance failed' };
    default:
      return { className: 'pill', label: 'No bond yet' };
  }
}

export default function DashboardPage() {
  const businesses = listAllBusinesses();
  const stats = getPlatformStats();
  const totalFaceValueUsd = Number(BigInt(stats.totalFaceValueUsdMicros) / 1_000_000n);

  return (
    <main className="page-wide">
      <div className="fade-up" style={{ ['--stagger' as string]: 0 }}>
        <h1>Dashboard</h1>
        <p>Every business registered on Tally, its real Stripe connection state, and its latest real bond attempt.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card fade-up" style={{ ['--stagger' as string]: 1 }}>
          <p className="stat-label">Businesses</p>
          <p className="stat">
            <CountUp value={stats.totalBusinesses} />
          </p>
        </div>
        <div className="stat-card fade-up" style={{ ['--stagger' as string]: 2 }}>
          <p className="stat-label">Bonds issued</p>
          <p className="stat">
            <CountUp value={stats.bondsIssued} />
          </p>
        </div>
        <div className="stat-card fade-up" style={{ ['--stagger' as string]: 3 }}>
          <p className="stat-label">Total face value</p>
          <p className="stat">
            <CountUp value={totalFaceValueUsd} prefix="$" />
          </p>
        </div>
        <div className="stat-card fade-up" style={{ ['--stagger' as string]: 4 }}>
          <p className="stat-label">Transactions synced</p>
          <p className="stat">
            <CountUp value={stats.totalTransactions} />
          </p>
        </div>
      </div>

      <div className="section-heading">
        <h2>Businesses</h2>
        <a className="button-link" href="/register">
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
              <Link key={b.issuerId} href={`/business/${b.issuerId}`} className="biz-card fade-up" style={{ ['--stagger' as string]: i }}>
                <div className="biz-card-header">
                  <h3>{b.name}</h3>
                </div>
                <p className="stat-label" style={{ marginBottom: 0 }}>
                  {b.issuerId}
                </p>
                <div className="pill-row">
                  {b.isDemo && <span className="pill pill-demo">Synthetic demo</span>}
                  <span className={b.stripeConnected ? 'pill pill-issued' : 'pill'}>
                    {b.stripeConnected ? 'Stripe connected' : 'No Stripe'}
                  </span>
                  <span className={bondPill.className}>{bondPill.label}</span>
                  {b.couponBps != null && <span className="pill">{(b.couponBps / 100).toFixed(2)}% coupon</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
