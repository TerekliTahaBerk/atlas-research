// Deterministic App Router context for component tests; real routing is tested in Playwright.
import { vi } from 'vitest';

export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
};
let search = new URLSearchParams();
export function setSearchParams(value: string) {
  search = new URLSearchParams(value);
}
export function usePathname() {
  return '/app/projects/sample/overview';
}
export function useRouter() {
  return routerMock;
}
export function useSearchParams() {
  return search;
}
export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND');
}
export function redirect(href: string): never {
  throw new Error(`NEXT_REDIRECT ${href}`);
}
