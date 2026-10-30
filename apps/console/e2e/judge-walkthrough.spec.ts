import { test, expect, type ConsoleMessage } from '@playwright/test';

/// A read-only pass over every page a visitor can reach, in a real browser.
/// Writes nothing, so it is safe to point at the deployed app. Each page must
/// render its own heading, raise no uncaught page error, and log no console
/// error that would show up in devtools during a demo.
const PAGES: { path: string; expect: RegExp }[] = [
  { path: '/', expect: /Tally/i },
  { path: '/proof', expect: /Verify on-chain/i },
  { path: '/market', expect: /market/i },
  { path: '/register', expect: /register|business/i },
  { path: '/register-lookup', expect: /repayment register/i },
  { path: '/dashboard', expect: /dashboard|business/i },
  { path: '/pitch', expect: /./ },
  { path: '/business/issuer-corrados-deli-f5bb20', expect: /Corrados Deli/i },
];

// Noise that is not the app's fault and would make the suite flap.
const IGNORED = [
  /favicon/i,
  /Download the React DevTools/i,
  /Content Security Policy/i,
  /net::ERR_BLOCKED_BY_CLIENT/i,
];

for (const page_ of PAGES) {
  test(`${page_.path} renders cleanly`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (m: ConsoleMessage) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      if (IGNORED.some((re) => re.test(text))) return;
      consoleErrors.push(text);
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const response = await page.goto(page_.path, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${page_.path} HTTP status`).toBeLessThan(400);

    await expect(page.locator('body')).toContainText(page_.expect, { timeout: 15_000 });

    // Next.js renders its crash screen into this id; catching it here is what
    // turned up the /business/:id 500 that a status check alone would miss
    // once the server starts returning a soft error page.
    await expect(page.locator('#__next_error__')).toHaveCount(0);

    expect(pageErrors, `${page_.path} uncaught page errors`).toEqual([]);
    expect(consoleErrors, `${page_.path} console errors`).toEqual([]);
  });
}

test('no loading placeholder is left stranded on the business page', async ({ page }) => {
  await page.goto('/business/issuer-corrados-deli-f5bb20', { waitUntil: 'domcontentloaded' });
  // The bond panel hydrates client-side; a judge must not be left looking at
  // a spinner that never resolves.
  await expect(page.getByText(/Loading bond status/i)).toHaveCount(0, { timeout: 20_000 });
});

test('the CRE registry is verifiable from the proof page', async ({ page }) => {
  await page.goto('/proof', { waitUntil: 'domcontentloaded' });
  const link = page.getByRole('link', { name: /0xFde2B3180a8D5a72a57d5c4AE0485cBcEF23362c/i }).first();
  await expect(link).toBeVisible();
  expect(await link.getAttribute('href')).toContain('sepolia.etherscan.io/address/');
});
