import { chromium, type Browser, type Page } from 'playwright';
import { ethers } from 'ethers';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CustodianKey {
  privateKeyHex: string; // real ECDSA private key — Tally's own custodian key, never the business's
  rpcUrl: string; // e.g. https://testnet.hashio.io/api
  /// Absolute path to the built browser-runner/dist/entry.js. Defaults to a
  /// path next to this file, which is correct when this module runs as its
  /// own file (tsx scratch scripts, this package's own tests). A caller
  /// whose bundler concatenates multiple source files into one output chunk
  /// per route (e.g. Next.js/webpack) must pass this explicitly — inside
  /// such a chunk, `__dirname` resolves to the chunk's own output location,
  /// not this file's real directory, so the default silently breaks
  /// (confirmed live: ENOENT looking for dist/entry.js under .next/server/).
  bundlePath?: string;
}

/// The EIP-1193 provider injected as `window.ethereum` before any page
/// script runs. It implements just enough of the interface for
/// ethers.BrowserProvider (which the ATS SDK's MetamaskService uses
/// internally) to work: isMetaMask/isConnected checks, the on/removeListener
/// calls MetamaskService's constructor makes unconditionally, and a
/// `request()` that signs with our real wallet for account/signing methods
/// and forwards everything else straight to the real Hedera JSON-RPC relay.
/// This is the same pattern browser-automation test tools (e.g. Synpress)
/// use to drive a real dApp without a real MetaMask extension — the SDK
/// code path is exercised exactly as designed, only the wallet backing it
/// is ours instead of a human's.
const INIT_SCRIPT = `
window.ethereum = {
  isMetaMask: true,
  isConnected: () => true,
  _listeners: {},
  on(event, handler) {
    (this._listeners[event] ||= []).push(handler);
  },
  removeListener(event, handler) {
    this._listeners[event] = (this._listeners[event] || []).filter((h) => h !== handler);
  },
  async request({ method, params }) {
    const resultJson = await window.__tallyBridge(JSON.stringify({ method, params: params ?? [] }));
    const parsed = JSON.parse(resultJson);
    if (parsed.error) throw new Error(parsed.error);
    return parsed.result;
  },
};
`;

async function bridgeHandler(provider: ethers.JsonRpcProvider, wallet: ethers.Wallet, argsJson: string): Promise<string> {
  try {
    const { method, params } = JSON.parse(argsJson) as { method: string; params: unknown[] };

    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return JSON.stringify({ result: [wallet.address] });

      case 'eth_sendTransaction': {
        const tx = params[0] as ethers.TransactionRequest;
        const response = await wallet.sendTransaction(tx);
        return JSON.stringify({ result: response.hash });
      }

      case 'personal_sign': {
        const [message] = params as [string];
        const signature = await wallet.signMessage(ethers.getBytes(message));
        return JSON.stringify({ result: signature });
      }

      case 'eth_signTypedData_v4': {
        const [, typedDataJson] = params as [string, string];
        const typedData = JSON.parse(typedDataJson);
        const { domain, types, message } = typedData;
        delete types.EIP712Domain;
        const signature = await wallet.signTypedData(domain, types, message);
        return JSON.stringify({ result: signature });
      }

      default: {
        // Every other eth_*/net_* read method (eth_chainId, eth_call,
        // eth_estimateGas, eth_getTransactionCount, eth_getTransactionReceipt,
        // eth_blockNumber, eth_getBalance, ...) goes straight to the real RPC.
        const result = await provider.send(method, params);
        return JSON.stringify({ result });
      }
    }
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

export interface BrowserSignerSession {
  page: Page;
  close(): Promise<void>;
}

/// Serves the bundle over real HTTP on localhost instead of loading it via
/// page.setContent()/addScriptTag(). This isn't cosmetic: `setContent()`
/// leaves the page on an opaque/non-secure origin, where the Web Crypto
/// API's `crypto.randomUUID()` (used deep in the SDK's dependency tree) is
/// undefined by spec — only a secure context (https, or the special-cased
/// http://localhost) has it.
function serveBundle(bundleSource: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html><html><body><script>${bundleSource}</script></body></html>`);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

/// Launches a real (headless) Chromium tab, injects the wallet shim above,
/// loads the ats-client bundle, and returns a Playwright Page whose
/// `window.__tally` exposes connectAtsBackend/issueFixedRateBond/
/// redeemBondAtMaturity — call them with `page.evaluate(...)`.
export async function startBrowserSignerSession(key: CustodianKey): Promise<BrowserSignerSession> {
  const provider = new ethers.JsonRpcProvider(key.rpcUrl);
  const wallet = new ethers.Wallet(key.privateKeyHex, provider);

  const browser: Browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', (msg) => console.log(`[browser console:${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.error('[browser pageerror]', err));

  await page.exposeFunction('__tallyBridge', (argsJson: string) => bridgeHandler(provider, wallet, argsJson));
  await page.addInitScript(INIT_SCRIPT);

  const bundlePath = key.bundlePath ?? join(__dirname, 'dist', 'entry.js');
  const bundleSource = readFileSync(bundlePath, 'utf8');
  const { server, url } = await serveBundle(bundleSource);

  await page.goto(url);

  // Sanity check: the bundle must have actually run and exposed window.__tally.
  await page.waitForFunction(() => Boolean((window as unknown as { __tally?: unknown }).__tally), { timeout: 10_000 });

  return {
    page,
    close: async () => {
      await browser.close();
      server.close();
    },
  };
}
