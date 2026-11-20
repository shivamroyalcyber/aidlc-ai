import type { DateFormat, ValueType } from '../config/types';
import { isRecord, textOf } from './xml';

export type Converted = { ok: true; value: unknown } | { ok: false; error: string };

interface ConvertOptions {
  type?: ValueType;
  sourceFormat?: DateFormat;
  targetFormat?: DateFormat;
  lookup?: Record<string, string>;
}

const DATE_PATTERNS: Record<DateFormat, RegExp> = {
  iso: /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/,
  yyyyMMdd: /^(\d{4})(\d{2})(\d{2})$/,
  ddMMyyyy: /^(\d{2})(\d{2})(\d{4})$/,
};

/** Parses a date in the given format into [year, month, day], or null if invalid. */
export function parseDate(value: string, format: DateFormat): [number, number, number] | null {
  const match = DATE_PATTERNS[format].exec(value.trim());
  if (!match) return null;
  const [a, b, c] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const [y, m, d] = format === 'ddMMyyyy' ? [c, b, a] : [a, b, c];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return [y, m, d];
}

export function formatDate([y, m, d]: [number, number, number], format: DateFormat): string {
  const yyyy = String(y).padStart(4, '0');
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  if (format === 'yyyyMMdd') return `${yyyy}${mm}${dd}`;
  if (format === 'ddMMyyyy') return `${dd}${mm}${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

/** Applies lookup, then type conversion. */
export function convertValue(raw: unknown, opts: ConvertOptions): Converted {
  let value = textOf(raw);
  if (opts.lookup && (typeof value === 'string' || typeof value === 'number')) {
    const hit = opts.lookup[String(value)];
    if (hit !== undefined) value = hit;
  }
  switch (opts.type) {
    case undefined:
      return { ok: true, value };
    case 'string':
      if (isRecord(value) || Array.isArray(value)) return { ok: false, error: 'is not a text value' };
      return { ok: true, value: String(value) };
    case 'number':
    case 'integer': {
      const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      if (!Number.isFinite(n)) return { ok: false, error: 'is not a number' };
      if (opts.type === 'integer' && !Number.isInteger(n)) return { ok: false, error: 'is not an integer' };
      return { ok: true, value: n };
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value };
      const s = String(value).trim().toLowerCase();
      if (['true', '1', 'y', 'yes'].includes(s)) return { ok: true, value: true };
      if (['false', '0', 'n', 'no'].includes(s)) return { ok: true, value: false };
      return { ok: false, error: 'is not a boolean' };
    }
    case 'date': {
      const from = opts.sourceFormat ?? 'iso';
      const parsed = typeof value === 'string' ? parseDate(value, from) : null;
      if (!parsed) return { ok: false, error: `is not a valid ${from} date` };
      return { ok: true, value: formatDate(parsed, opts.targetFormat ?? 'iso') };
    }
  }
}
