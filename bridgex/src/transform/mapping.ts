import type { MappingRule } from '../config/types';
import { convertValue } from './convert';
import { getPath, setPath } from './paths';

export interface MappingResult {
  output: Record<string, unknown>;
  errors: string[];
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/**
 * Applies declarative mapping rules to a source document.
 * `prefix` is added to every output element name (`ns:` for SOAP bodies).
 */
export function applyMappings(source: unknown, rules: MappingRule[], opts: { prefix?: string } = {}): MappingResult {
  const output: Record<string, unknown> = {};
  const errors: string[] = [];
  mapInto(source, rules, output, errors, opts.prefix ?? '', '');
  return { output, errors };
}

function mapInto(
  source: unknown,
  rules: MappingRule[],
  output: Record<string, unknown>,
  errors: string[],
  prefix: string,
  context: string,
): void {
  for (const rule of rules) {
    const where = context + rule.from;
    const raw = getPath(source, rule.from);

    if (isMissing(raw)) {
      if (rule.default !== undefined) setPath(output, rule.to, rule.default, prefix);
      else if (rule.required) errors.push(`${where}: is required`);
      continue;
    }

    if (rule.items) {
      const items = rule.items;
      const mapped = asArray(raw).map((element, index) => {
        const item: Record<string, unknown> = {};
        mapInto(element, items, item, errors, prefix, `${where}[${index}].`);
        return item;
      });
      setPath(output, rule.to, mapped, prefix);
      continue;
    }

    if (rule.array) {
      const values: unknown[] = [];
      asArray(raw).forEach((element, index) => {
        const result = convertValue(element, rule);
        if (result.ok) values.push(result.value);
        else errors.push(`${where}[${index}]: ${result.error}`);
      });
      setPath(output, rule.to, values, prefix);
      continue;
    }

    const result = convertValue(raw, rule);
    if (result.ok) setPath(output, rule.to, result.value, prefix);
    else errors.push(`${where}: ${result.error}`);
  }
}
