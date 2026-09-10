import { describe, expect, it } from 'vitest';
import { computeBondId } from './secondary-market';

describe('computeBondId', () => {
  it('is deterministic for the same bond token and address', () => {
    const a = computeBondId('0xf9ee878855efd2b104b9e8b6f81b4fbb1ac88f0e', '0.0.10425775');
    const b = computeBondId('0xf9ee878855efd2b104b9e8b6f81b4fbb1ac88f0e', '0.0.10425775');
    expect(a).toBe(b);
  });

  it('differs for different bond tokens', () => {
    const a = computeBondId('0xf9ee878855efd2b104b9e8b6f81b4fbb1ac88f0e', '0.0.10425775');
    const b = computeBondId('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '0.0.10425775');
    expect(a).not.toBe(b);
  });

  it('produces a real 32-byte hex value', () => {
    const id = computeBondId('0xf9ee878855efd2b104b9e8b6f81b4fbb1ac88f0e', '0.0.10425775');
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
