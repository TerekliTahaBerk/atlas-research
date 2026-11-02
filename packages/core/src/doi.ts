/*
 * DOI syntax normalization shared by research and interchange contracts.
 */
const doiPattern = /^10\.\d{4,9}\/[^\s]+$/;
/**
 * Canonicalizes DOI spellings (URL/doi: prefixes, whitespace, Unicode,
 * percent-encoding, case). It validates syntax only: a well-formed result
 * never proves that the DOI is registered or belongs to a given work.
 */
export function normalizeDoi(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  let value = input.normalize('NFKC').trim();
  if (!value || value.length > 500) return null;
  value = value.replace(/^doi:\s*/i, '');
  value = value.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  if (/%[0-9a-f]{2}/i.test(value)) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  value = value.normalize('NFKC').trim().toLowerCase();
  if (value.length > 300 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return doiPattern.test(value) ? value : null;
}
