import { isRecord } from './xml';

/** Reads a dot path. Numeric segments index arrays. */
export function getPath(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Writes a dot path, creating objects on the way. `prefix` is added to every segment (for `ns:` SOAP elements). */
export function setPath(target: Record<string, unknown>, path: string, value: unknown, prefix = ''): void {
  const segments = path.split('.').map((segment) => prefix + segment);
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    const next = current[segment];
    if (!isRecord(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  if (last !== undefined) current[last] = value;
}

/** Lists leaf paths of a document. Arrays are described by their first element and written `name[]`. */
export function leafPaths(source: unknown, base = ''): string[] {
  if (Array.isArray(source)) {
    const first: unknown = source[0];
    if (isRecord(first)) return leafPaths(first, base ? `${base}[]` : '');
    return base ? [`${base}[]`] : [];
  }
  if (!isRecord(source)) return base ? [base] : [];
  const out: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('@_')) continue;
    if (key === '#text') {
      if (base) out.push(base);
      continue;
    }
    const path = base ? `${base}.${key}` : key;
    out.push(...leafPaths(value, path));
  }
  return out;
}
