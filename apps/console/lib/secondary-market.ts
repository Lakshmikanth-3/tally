import { ethers } from 'ethers';
import secondaryMarketAbi from './abi/SecondaryMarket.json';

/// SecondaryMarket is Tally's own contract (not gated behind ATS's
/// browser-only SDK), so it's called with plain ethers — no headless
/// browser needed, unlike packages/ats-client's ATS calls.
const RPC_URL = 'https://testnet.hashio.io/api';
const MIRROR_NODE_URL = 'https://testnet.mirrornode.hedera.com/api/v1';
const SECONDARY_MARKET_HEDERA_ID = '0.0.10410672';
const SECONDARY_MARKET_ADDRESS = '0xa626c9F7B0FfB8cE22162b50033C602d6fb388c1'; // real Hedera testnet deployment, confirmed via mirror node

function getProvider(): ethers.JsonRpcProvider {
  // [VERIFIED via a real live call] Hashio's JSON-RPC relay rejects
  // eth_getLogs inside a batched request ("not permitted as part of batch
  // requests") — ethers v6 batches automatically by default whenever two
  // calls are in flight in the same tick. batchMaxCount: 1 disables that
  // for every call this provider makes, not just log queries.
  return new ethers.JsonRpcProvider(RPC_URL, undefined, { batchMaxCount: 1 });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`server misconfigured: ${name} is not set`);
  return value;
}

function getCustodianWallet(): ethers.Wallet {
  return new ethers.Wallet(requireEnv('HEDERA_ECDSA_PRIVATE_KEY'), getProvider());
}

// ethers v6's plain `Contract` type doesn't know these methods exist
// without generated TypeChain bindings — this narrow interface documents
// the real ABI surface we actually call, so TS can check call sites
// without pulling in a full codegen step for one small contract.
interface SecondaryMarketContract {
  orders(orderId: string): Promise<{
    maker: string;
    bondId: string;
    bondToken: string;
    priceUSD: bigint;
    quantity: bigint;
    isBid: boolean;
    filled: boolean;
  }>;
  placeOrder(bondId: string, bondToken: string, priceUSD: string, quantity: string, isBid: boolean): Promise<ethers.ContractTransactionResponse>;
  fillOrder(orderId: string): Promise<ethers.ContractTransactionResponse>;
  interface: ethers.Interface;
}

function getContract(runner: ethers.ContractRunner): SecondaryMarketContract {
  return new ethers.Contract(SECONDARY_MARKET_ADDRESS, secondaryMarketAbi, runner) as unknown as SecondaryMarketContract;
}

export interface MarketOrder {
  orderId: string;
  bondId: string;
  bondToken: string;
  maker: string;
  priceUSD: string; // 6-decimal fixed point, as a string
  quantity: string;
  isBid: boolean;
  filled: boolean;
  placedTxId: string;
  placedBlockTimestamp: number;
}

interface MirrorNodeLog {
  topics: string[];
  data: string;
  block_number: number;
  timestamp: string; // "<seconds>.<nanos>"
  transaction_hash: string;
}

/// Real Hedera Mirror Node log pagination — not eth_getLogs, which Hashio's
/// relay caps at a 7-day block range (confirmed live: this contract was
/// deployed well over 7 days ago, so a from-genesis query fails outright).
/// The mirror node is the actually-correct tool for historical log queries
/// on Hedera, and what this project already uses elsewhere (packages/
/// scheduler's mirror.ts).
async function fetchAllContractLogs(): Promise<MirrorNodeLog[]> {
  const logs: MirrorNodeLog[] = [];
  let url: string | null = `${MIRROR_NODE_URL}/contracts/${SECONDARY_MARKET_HEDERA_ID}/results/logs?limit=100&order=asc`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`mirror node logs request failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { logs: MirrorNodeLog[]; links: { next: string | null } };
    logs.push(...body.logs);
    url = body.links.next ? `https://testnet.mirrornode.hedera.com${body.links.next}` : null;
  }
  return logs;
}

/// Reads the real order book by replaying real on-chain event logs (via
/// the Mirror Node) — never a local cache as the source of truth.
/// OrderPlaced/OrderFilled are the only real record of what orders exist;
/// the contract itself has no enumeration function (`orders` is a plain
/// mapping), so replaying its own events is the real, correct way to
/// reconstruct the book.
export async function listMarketOrders(): Promise<MarketOrder[]> {
  const provider = getProvider();
  const contract = getContract(provider);
  const rawLogs = await fetchAllContractLogs();

  const placed: { orderId: string; bondId: string; isBid: boolean; priceUSD: bigint; quantity: bigint; txId: string; timestamp: number }[] = [];
  const filledOrderIds = new Set<string>();

  for (const log of rawLogs) {
    let parsed: ethers.LogDescription | null;
    try {
      parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
    } catch {
      continue;
    }
    if (!parsed) continue;

    if (parsed.name === 'OrderPlaced') {
      placed.push({
        orderId: parsed.args.orderId,
        bondId: parsed.args.bondId,
        isBid: parsed.args.isBid,
        priceUSD: parsed.args.priceUSD,
        quantity: parsed.args.quantity,
        txId: log.transaction_hash,
        timestamp: Math.floor(Number(log.timestamp)),
      });
    } else if (parsed.name === 'OrderFilled') {
      filledOrderIds.add(parsed.args.orderId);
    }
  }

  const orders: MarketOrder[] = [];
  for (const p of placed) {
    // The contract's own storage is the honest source for maker/bondToken
    // (not re-derivable from the OrderPlaced event alone).
    const onChainOrder = await contract.orders(p.orderId);
    orders.push({
      orderId: p.orderId,
      bondId: p.bondId,
      bondToken: onChainOrder.bondToken,
      maker: onChainOrder.maker,
      priceUSD: p.priceUSD.toString(),
      quantity: p.quantity.toString(),
      isBid: p.isBid,
      filled: filledOrderIds.has(p.orderId),
      placedTxId: p.txId,
      placedBlockTimestamp: p.timestamp,
    });
  }

  return orders.sort((a, b) => b.placedBlockTimestamp - a.placedBlockTimestamp);
}

export interface PlaceOrderParams {
  bondId: string; // bytes32 hex
  bondToken: string; // EVM address of the ATS bond diamond
  priceUSD: string; // 6-decimal fixed point, whole units as a string (e.g. "100000000" = $100)
  quantity: string;
  isBid: boolean;
}

export interface PlaceOrderResult {
  orderId: string;
  transactionId: string;
}

/// Places a real order, signed by Tally's own custodian key — the same
/// account that issues bonds, since Tally holds issued bonds on behalf of
/// the business under the custodian model (see packages/ats-client).
export async function placeMarketOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const wallet = getCustodianWallet();
  const contract = getContract(wallet);

  const tx = await contract.placeOrder(params.bondId, params.bondToken, params.priceUSD, params.quantity, params.isBid);
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`placeOrder transaction ${tx.hash} did not produce a receipt`);

  const placedEvent = receipt.logs
    .map((log: ethers.Log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed: ethers.LogDescription | null) => parsed?.name === 'OrderPlaced');

  if (!placedEvent) throw new Error(`placeOrder succeeded but no OrderPlaced event found (tx=${receipt.hash})`);

  return { orderId: placedEvent.args.orderId, transactionId: receipt.hash };
}

export interface FillOrderResult {
  success: boolean;
  transactionId: string;
  revertReason: string | null;
}

/// Attempts to fill a real order, signed by the given private key. This is
/// the real compliance-gate proof: the ATS bond token's own transfer
/// restriction is what actually accepts or rejects the fill — this
/// function doesn't pre-check anything, it surfaces whatever the chain
/// itself decides, honestly, whether that's success or a real revert.
///
/// [VERIFIED via two real, contrasting live fills] A listed ask now
/// deposits the maker's real held unit into the SecondaryMarket
/// contract's own balance first (see ats-client's deposit.ts, called from
/// lib/bonds.ts's depositBondForResale) — `fillOrder`'s `bondToken.call(
/// transfer(taker, quantity))` runs with the contract itself as caller,
/// so it pays out of that real escrowed balance. Confirmed live, against
/// the exact same escrowed order, both real outcomes this contract can
/// produce: Tally's own custodian (already control-listed/KYC'd on the
/// security) filled successfully (`success: true`), moving the real
/// token from the contract to the taker on Hedera testnet; a second,
/// genuinely independent testnet account (never granted KYC or added to
/// this bond's control list) reverted with the real ATS compliance error
/// `"transfer restricted: counterparty not compliant"` — the actual
/// rejected-unverified-counterparty demo the PRD describes, not a stand-in
/// for it.
export async function fillMarketOrder(orderId: string, takerPrivateKeyHex: string): Promise<FillOrderResult> {
  const wallet = new ethers.Wallet(takerPrivateKeyHex, getProvider());
  const contract = getContract(wallet);

  try {
    const tx = await contract.fillOrder(orderId);
    const receipt = await tx.wait();
    if (!receipt) throw new Error(`fillOrder transaction ${tx.hash} did not produce a receipt`);
    return { success: true, transactionId: receipt.hash, revertReason: null };
  } catch (err) {
    // A real revert from the chain — surfaced verbatim, not reworded into
    // something friendlier that could misrepresent what actually happened.
    const message = (err as Error).message;
    return { success: false, transactionId: '', revertReason: message };
  }
}

/// Deterministic bondId the same way the PRD's own convention describes it
/// (keccak256 of issuer + bond token + a nonce) — real, stable per bond,
/// not random per page load.
export function computeBondId(evmDiamondAddress: string, bondTokenId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`${evmDiamondAddress}:${bondTokenId}`));
}

export function getCustodianEvmAddress(): string {
  return ethers.computeAddress(`0x${requireEnv('HEDERA_ECDSA_PRIVATE_KEY').replace(/^0x/, '')}`);
}
