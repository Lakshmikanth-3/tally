import { describe, expect, it } from 'vitest';
import { db, toPositional, withTransaction } from './db';

describe('toPositional', () => {
  it('numbers placeholders left to right', () => {
    expect(toPositional('SELECT * FROM bonds WHERE issuer_id = ? AND status = ?')).toBe(
      'SELECT * FROM bonds WHERE issuer_id = $1 AND status = $2',
    );
  });

  it('leaves SQL without placeholders untouched', () => {
    expect(toPositional("SELECT COUNT(*) FROM bonds WHERE status = 'issued'")).toBe("SELECT COUNT(*) FROM bonds WHERE status = 'issued'");
  });

  it('handles many placeholders past $9', () => {
    const sql = `INSERT INTO t VALUES (${Array.from({ length: 16 }, () => '?').join(', ')})`;
    const converted = toPositional(sql);
    expect(converted).toContain('$9, $10');
    expect(converted).toContain('$16)');
    expect(converted).not.toContain('?');
  });
});

// Runs against the real configured Postgres database when DATABASE_URL is
// available (locally, via .env.local); skipped otherwise, never mocked.
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)('against the real database', () => {
  it('returns BIGINT counts and timestamps as numbers, not strings', async () => {
    const row = await db.get<{ n: number; ts: number }>('SELECT COUNT(*) AS n, MAX(created_at) AS ts FROM businesses');
    expect(typeof row?.n).toBe('number');
    expect(row?.ts === null || typeof row?.ts === 'number').toBe(true);
  });

  it('rolls a failed transaction back completely', async () => {
    const issuerId = `issuer-vitest-rollback-${Date.now()}`;
    await expect(
      withTransaction(async (tx) => {
        await tx.run('INSERT INTO businesses (issuer_id, name, created_at) VALUES (?, ?, ?)', issuerId, 'vitest rollback', 0);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await db.get('SELECT issuer_id FROM businesses WHERE issuer_id = ?', issuerId)).toBeUndefined();
  });

  it('ignores a duplicate Stripe charge instead of double-counting revenue', async () => {
    const issuerId = `issuer-vitest-dedupe-${Date.now()}`;
    const chargeId = `ch_vitest_${Date.now()}`;
    try {
      await db.run('INSERT INTO businesses (issuer_id, name, created_at) VALUES (?, ?, ?)', issuerId, 'vitest dedupe', 0);
      for (let i = 0; i < 2; i++) {
        await db.run(
          "INSERT INTO transactions (issuer_id, amount_usd, timestamp_seconds, source, stripe_charge_id) VALUES (?, ?, ?, 'stripe', ?) ON CONFLICT DO NOTHING",
          issuerId,
          '1000000',
          0,
          chargeId,
        );
      }
      const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE issuer_id = ?', issuerId);
      expect(row?.n).toBe(1);
    } finally {
      await db.run('DELETE FROM transactions WHERE issuer_id = ?', issuerId);
      await db.run('DELETE FROM businesses WHERE issuer_id = ?', issuerId);
    }
  });
});
