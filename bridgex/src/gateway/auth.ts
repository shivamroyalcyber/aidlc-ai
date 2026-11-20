import { safeEqual } from './secrets';

/** Client API key check (FR-09). Constant time whatever the input (NFR-01). */
export function apiKeyMatches(given: string | undefined, expected: string): boolean {
  if (!given || !expected) return false;
  return safeEqual(given, expected);
}
