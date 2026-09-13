import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

/// Constant-time string comparison. Hashing first means both sides are the
/// same fixed length, so timingSafeEqual can't throw on a length mismatch
/// (and the length itself doesn't leak).
export function secretsMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bearerToken(req: NextRequest): string {
  const header = req.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

/// [VERIFIED by logging real requests] Next.js sets x-forwarded-* on every
/// request it serves, including direct local ones, so the *presence* of
/// those headers says nothing. What distinguishes a local caller is the
/// value: a request from this machine's own browser arrives as `::1`, while
/// one forwarded by a tunnel carries the real remote client's address.
function isLoopbackAddress(address: string): boolean {
  const host = address.trim().replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '');
  return host === '::1' || host === 'localhost' || /^127\./.test(host);
}

/// Every address in the forwarding chain must be loopback. x-forwarded-for
/// is a comma-separated list where the left-most entry is the original
/// client, so a tunnel's real visitor shows up there even though the hop
/// that actually reached this server was local.
function isLocalRequest(req: NextRequest): boolean {
  const chain = [req.headers.get('x-forwarded-for'), req.headers.get('x-real-ip')]
    .filter((v): v is string => Boolean(v))
    .flatMap((v) => v.split(','));

  if (chain.length > 0 && !chain.every(isLoopbackAddress)) return false;

  // A tunnel also rewrites the host it forwards under (an ngrok domain, say),
  // while a direct call keeps localhost.
  const forwardedHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  const hostname = forwardedHost.split(':')[0] ?? '';
  return hostname === '' || isLoopbackAddress(hostname);
}

/// Guards the routes that actually move value — issuing a real bond,
/// arming real scheduled HBAR payments, escrowing real bond units, signing
/// a fill with Tally's custodian key.
///
/// Why this shape rather than a bearer token on every route: the console's
/// own UI calls these endpoints straight from the browser (BondPanel,
/// PlaceOrderPanel, CouponSchedulePanel, ...), so any token they could send
/// would have to ship to the client and would be public anyway. What
/// actually needs blocking is the real exposure this repo hit: running the
/// console behind a public tunnel (needed so Chainlink's DON can reach
/// /revenue) silently published every one of these routes to the internet,
/// where an anonymous POST could make the custodian sign transactions —
/// `takerPrivateKeyHex ?? HEDERA_ECDSA_PRIVATE_KEY` in the fill route being
/// the sharpest example.
///
/// So: a request that a proxy forwarded from outside is refused unless it
/// carries TALLY_ADMIN_TOKEN, while the local browser UI keeps working
/// untouched.
///
/// This is a deployment-context guard, NOT authentication. It assumes the
/// machine running the console is trusted and that only a proxy can put an
/// outside caller in front of it. If this app were ever hosted publicly for
/// real users, every one of these routes would need genuine per-user auth
/// instead — this would not be sufficient.
export function requireTrustedCaller(req: NextRequest): NextResponse | null {
  const adminToken = process.env.TALLY_ADMIN_TOKEN;
  const presented = bearerToken(req);
  if (adminToken && presented && secretsMatch(presented, adminToken)) {
    return null;
  }

  if (!isLocalRequest(req)) {
    return NextResponse.json(
      {
        error:
          'refused: this endpoint moves real funds and was reached through a proxy or tunnel. Present TALLY_ADMIN_TOKEN as a bearer token, or call it directly from the machine running the console.',
      },
      { status: 403 },
    );
  }

  return null;
}
