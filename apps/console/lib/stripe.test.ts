import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isStripeTestMode } from './stripe';

// Regression: the hosted deployment has no Stripe credentials at all, and
// isStripeTestMode() used to go through requireEnv(). The business page calls
// it while rendering, so a missing key turned /business/:id into a 500 — the
// first page a visitor opens from the demo link.
describe('isStripeTestMode', () => {
  const original = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = original;
  });

  it('does not throw when no Stripe key is configured', () => {
    expect(() => isStripeTestMode()).not.toThrow();
  });

  it('reports not-test-mode when unconfigured, so callers fail closed', () => {
    expect(isStripeTestMode()).toBe(false);
  });

  it('reports test mode only for a test-mode key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc123';
    expect(isStripeTestMode()).toBe(true);
    process.env.STRIPE_SECRET_KEY = 'sk_live_abc123';
    expect(isStripeTestMode()).toBe(false);
  });
});
