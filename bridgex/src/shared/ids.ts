import { randomInt } from 'node:crypto';

/**
 * Time-ordered request id: 9 base36 characters of milliseconds, a dash, 4 random base36 characters.
 * Sorts by time. The suffix uses crypto randomness so ids stay unique even when callers stub Math.random.
 */
export function newRequestId(now: Date): string {
  const time = now.getTime().toString(36).padStart(9, '0');
  const suffix = randomInt(36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${time}-${suffix}`;
}
