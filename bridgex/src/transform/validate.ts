import type { FieldSchema } from '../config/types';
import { parseDate } from './convert';
import { getPath } from './paths';
import { isRecord, textOf } from './xml';

/**
 * Checks a payload against an integration schema and returns every failure.
 * `lenient` accepts numbers and booleans written as text, which is how XML carries them.
 */
export function validatePayload(source: unknown, schema: Record<string, FieldSchema>, opts: { lenient: boolean }): string[] {
  const errors: string[] = [];
  for (const [path, field] of Object.entries(schema)) {
    const value = textOf(getPath(source, path));
    if (value === undefined || value === null || value === '') {
      if (field.required) errors.push(`${path}: is required`);
      continue;
    }
    const typeError = checkType(value, field, opts.lenient);
    if (typeError) {
      errors.push(`${path}: ${typeError}`);
      continue;
    }
    const text = String(value);
    const number = Number(value);
    if (field.pattern && !new RegExp(field.pattern).test(text)) errors.push(`${path}: does not match pattern ${field.pattern}`);
    if (field.minLength !== undefined && text.length < field.minLength) errors.push(`${path}: is shorter than ${field.minLength}`);
    if (field.maxLength !== undefined && text.length > field.maxLength) errors.push(`${path}: is longer than ${field.maxLength}`);
    if (field.min !== undefined && number < field.min) errors.push(`${path}: is below ${field.min}`);
    if (field.max !== undefined && number > field.max) errors.push(`${path}: is above ${field.max}`);
    if (field.enum && !field.enum.map(String).includes(text)) errors.push(`${path}: must be one of ${field.enum.join(', ')}`);
  }
  return errors;
}

function checkType(value: unknown, field: FieldSchema, lenient: boolean): string | null {
  if (isRecord(value) || Array.isArray(value)) {
    return field.type ? `must be a ${field.type}` : null;
  }
  switch (field.type) {
    case undefined:
      return null;
    case 'string':
      return typeof value === 'string' ? null : 'must be a string';
    case 'number':
    case 'integer': {
      const ok = typeof value === 'number' || (lenient && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
      if (!ok || !Number.isFinite(Number(value))) return `must be a ${field.type}`;
      return field.type === 'integer' && !Number.isInteger(Number(value)) ? 'must be an integer' : null;
    }
    case 'boolean':
      return typeof value === 'boolean' || (lenient && ['true', 'false'].includes(String(value))) ? null : 'must be a boolean';
    case 'date':
      return typeof value === 'string' && parseDate(value, field.format ?? 'iso') ? null : `must be a ${field.format ?? 'iso'} date`;
  }
}
