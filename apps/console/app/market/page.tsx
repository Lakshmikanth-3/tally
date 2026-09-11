import { listAllIssuedBonds } from '@/lib/bonds';
import { computeBondId, listMarketOrders } from '@/lib/secondary-market';
import MarketFillPanel from './MarketFillPanel';
import PlaceBidPanel from './PlaceBidPanel';

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

  const bidCandidates = listAllIssuedBonds()
    .filter((b) => b.evmDiamondAddress && b.bondTokenId)
    .map((b) => ({
      bondId: computeBondId(b.evmDiamondAddress!, b.bondTokenId!),
      bondToken: b.evmDiamondAddress!,
      label: `${b.symbol} — ${b.bondTokenId}`,
    }));

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

      <PlaceBidPanel candidates={bidCandidates} />

      <section style={{ marginTop: 40 }}>
        <h2>Why a fill might revert</h2>
        <p style={{ fontSize: '0.87rem' }}>
          Listing an ask deposits the maker&apos;s held unit into the SecondaryMarket contract&apos;s own balance
          first, so <code>fillOrder</code> pays out of a real escrowed balance rather than an empty one. Verified live
          against the exact same escrowed order, both real outcomes: Tally&apos;s custodian (already control-listed
          and KYC&apos;d on the security) filled it successfully, and a second, genuinely independent testnet account
          — never granted KYC or added to that bond&apos;s control list — reverted with the real ATS compliance error
          <code>&quot;transfer restricted: counterparty not compliant&quot;</code>. That second case is the actual
          rejected-unverified-counterparty demo, not a stand-in for it.
        </p>
      </section>
    </main>
  );
}
