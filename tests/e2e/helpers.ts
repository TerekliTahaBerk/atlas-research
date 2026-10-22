import type { Page } from '@playwright/test';
export const base = '/app/projects/sample';
/** Pins the next-themes preference before the first paint (default is dark). */
export async function useTheme(page: Page, theme: 'light' | 'dark' | 'system') {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('theme', t);
    } catch {
      /* storage may be unavailable */
    }
  }, theme);
}
export function noHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  );
}
export const allowedStorageKeys = ['theme', 'atlas-sidebar-collapsed'];
export function storageKeys(page: Page) {
  return page.evaluate(() => Object.keys(localStorage));
}
