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
  it('accepts only HTTPS or loopback provider hosts and hides secrets', () => {
    expect(
      validateEnvironment({
        ATLAS_OPENALEX_BASE_URL: 'https://api.openalex.org',
        ATLAS_SEMANTIC_SCHOLAR_BASE_URL: 'http://127.0.0.1:3199',
      }).ATLAS_OPENALEX_BASE_URL,
    ).toBe('https://api.openalex.org');
    for (const value of [
      'http://api.openalex.org',
      'https://api.openalex.org/works',
      'http://169.254.169.254',
      'file:///etc/passwd',
    ])
      expect(() =>
        validateEnvironment({ ATLAS_OPENALEX_BASE_URL: value }),
      ).toThrow('ATLAS_OPENALEX_BASE_URL');
    try {
      validateEnvironment({ ATLAS_SCANNER_SECRET: 'too-short-secret' });
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(String(error)).toContain('ATLAS_SCANNER_SECRET');
      expect(String(error)).not.toContain('too-short-secret');
    }
  });
});
