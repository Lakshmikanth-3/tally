import { listMarketOrders } from '@/lib/secondary-market';
import MarketFillPanel from './MarketFillPanel';

function formatMicrosUSD(microsStr: string): string {
  return (Number(BigInt(microsStr)) / 1_000_000).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function shortHex(value: string, len = 10): string {
  return `${value.slice(0, len)}…${value.slice(-4)}`;
}

export default async function MarketPage() {
  let orders: Awaited<ReturnType<typeof listMarketOrders>> = [];
  let loadError: string | null = null;
  try {
    orders = await listMarketOrders();
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <main className="page-wide">
      <div className="fade-up" style={{ ['--stagger' as string]: 0, paddingTop: 40 }}>
        <h1>Secondary market</h1>
        <p style={{ maxWidth: 680 }}>
          A real resale venue for already-issued bonds — the gap ATS itself names as missing. Every order here is read
          directly from real on-chain event logs (via the Hedera Mirror Node), and a fill attempt is a real signed
          transaction: whatever the ATS bond token&apos;s own compliance gate decides — accept or revert — is exactly
          what you&apos;ll see, never pre-checked or simulated by this UI.
        </p>
      </div>

      {loadError && <p role="alert">Could not load the order book: {loadError}</p>}

      {!loadError && orders.length === 0 && (
        <div className="empty-state">
          <p>No orders placed yet.</p>
          <p style={{ fontSize: '0.85rem' }}>Place one from an issued bond&apos;s business page.</p>
        </div>
      )}

      {!loadError && orders.length > 0 && (
        <div className="table-scroll" style={{ marginTop: 24 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Side</th>
                <th>Bond token</th>
                <th>Price</th>
                <th>Status</th>
                <th>Order ID</th>
                <th>Fill</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderId}>
                  <td>{o.isBid ? 'Bid' : 'Ask'}</td>
                  <td className="mono">{shortHex(o.bondToken)}</td>
                  <td style={{ color: 'var(--text)' }}>{formatMicrosUSD(o.priceUSD)}</td>
                  <td>{o.filled ? '✓ Filled' : 'Open'}</td>
                  <td className="mono">{shortHex(o.orderId)}</td>
                  <td>{!o.filled && <MarketFillPanel orderId={o.orderId} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section style={{ marginTop: 40 }}>
        <h2>Why a fill might revert</h2>
        <p style={{ fontSize: '0.87rem' }}>
          <code>fillOrder</code> moves tokens out of the SecondaryMarket contract&apos;s own balance, not the order
          maker&apos;s — placing an order records intent only, it never deposits tokens. Until a real deposit step
          whitelists the contract on a bond&apos;s ATS control list, every fill reverts with the real ATS compliance
          error <code>&quot;transfer restricted: counterparty not compliant&quot;</code> — confirmed live, including
          against Tally&apos;s own already-KYC&apos;d custodian account. That revert is the same real enforcement path
          the compliance-rejection demo is about; it just currently triggers on the contract&apos;s own status rather
          than a specific unverified taker.
        </p>
      </section>
    </main>
  );
}
