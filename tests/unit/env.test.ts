import { describe, it, expect } from 'vitest';
import { validateEnvironment } from '../../apps/web/src/lib/env';
describe('environment boundary', () => {
  it('allows credential-free preview', () =>
    expect(validateEnvironment({}).ATLAS_MODE).toBe('preview'));
  it('rejects partial Supabase configuration', () =>
    expect(() =>
      validateEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      }),
    ).toThrow('configured together'));
  it('does not leak invalid values', () => {
    try {
      validateEnvironment({ DATABASE_URL: 'secret-value' });
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(String(error)).toContain('DATABASE_URL');
      expect(String(error)).not.toContain('secret-value');
    }
  });
  it('rejects live mode without its required security configuration', () =>
    expect(() => validateEnvironment({ ATLAS_MODE: 'live' })).toThrow(
      'Missing live environment variables',
    ));
});
