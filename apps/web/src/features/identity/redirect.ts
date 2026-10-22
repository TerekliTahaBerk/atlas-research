/** Only local application and invitation destinations; reject encoded separators. */
export function safeReturnTo(
  value: string | null | undefined,
  fallback = '/app/home',
) {
  if (
    !value ||
    value.length > 2048 ||
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    /%[0-9a-f]{2}/i.test(value)
  )
    return fallback;
  if (
    !value.startsWith('/app') &&
    value !== '/onboarding' &&
    value !== '/invite'
  )
    return fallback;
  try {
    const parsed = new URL(value, 'https://atlas.invalid');
    if (
      parsed.origin !== 'https://atlas.invalid' ||
      !(
        /^\/app(?:\/|$)/.test(parsed.pathname) ||
        ['/onboarding', '/invite'].includes(parsed.pathname)
      )
    )
      return fallback;
    return parsed.pathname + parsed.search;
  } catch {
    return fallback;
  }
}
