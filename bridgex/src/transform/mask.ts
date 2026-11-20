import type { MappingRule } from '../config/types';
import { getPath } from './paths';
import { textOf } from './xml';

export const SECRET_MASK = '********';

/** `ACC101` → `***101`. Values of three characters or fewer become `***`. */
export function maskValue(value: string): string {
  return value.length <= 3 ? '***' : `***${value.slice(-3)}`;
}

/**
 * Returns a function that hides sensitive values and secrets in any text.
 * Longest values are replaced first so a shorter value can't leave fragments of a longer one.
 */
export function createMasker(sensitive: string[], secrets: string[]): (text: string) => string {
  const pairs: Array<[string, string]> = [
    ...secrets.filter((s) => s.length >= 4).map((s): [string, string] => [s, SECRET_MASK]),
    ...sensitive.filter((s) => s.length >= 3).map((s): [string, string] => [s, maskValue(s)]),
  ].sort((a, b) => b[0].length - a[0].length);
  return (text) => pairs.reduce((out, [from, to]) => out.split(from).join(to), text);
}

/** Collects the values of rules marked `sensitive`, read from the rules' `from` paths. */
export function collectSensitive(source: unknown, rules: MappingRule[]): string[] {
  const out: string[] = [];
  for (const rule of rules) {
    const raw = getPath(source, rule.from);
    if (rule.items) {
      const items = rule.items;
      const elements = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
      for (const element of elements) out.push(...collectSensitive(element, items));
      continue;
    }
    if (!rule.sensitive) continue;
    const value = textOf(raw);
    if (typeof value === 'string' || typeof value === 'number') out.push(String(value));
  }
  return out;
}
