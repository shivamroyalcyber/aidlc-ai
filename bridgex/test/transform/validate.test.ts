import { describe, expect, it } from 'vitest';
import type { FieldSchema } from '../../src/config/types';
import { validatePayload } from '../../src/transform/validate';

const schema: Record<string, FieldSchema> = {
  accountId: { type: 'string', required: true, pattern: '^ACC[0-9]{3,12}$' },
  amount: { type: 'number', min: 0.01, max: 1000 },
  limit: { type: 'integer' },
  currency: { type: 'string', enum: ['INR'] },
  reference: { type: 'string', minLength: 2, maxLength: 5 },
  fromDate: { type: 'date' },
};

describe('U1 Req 4 – schema validation (FR-07)', () => {
  it('4.1 accepts a valid payload', () => {
    expect(validatePayload({ accountId: 'ACC101', amount: 10, limit: 5, currency: 'INR', reference: 'abc', fromDate: '2026-11-01' }, schema, { lenient: false })).toEqual([]);
  });

  it('4.2 returns every failing path with a reason', () => {
    const errors = validatePayload(
      { accountId: 'X1', amount: 5000, limit: 1.5, currency: 'USD', reference: 'toolong', fromDate: '2026-02-30' },
      schema,
      { lenient: false },
    );
    expect(errors).toEqual([
      'accountId: does not match pattern ^ACC[0-9]{3,12}$',
      'amount: is above 1000',
      'limit: must be an integer',
      'currency: must be one of INR',
      'reference: is longer than 5',
      'fromDate: must be a iso date',
    ]);
  });

  it('4.1 reports missing required fields', () => {
    expect(validatePayload({}, schema, { lenient: false })).toEqual(['accountId: is required']);
  });

  it('4.1 is strict about JSON types but lenient for XML text', () => {
    expect(validatePayload({ accountId: 'ACC101', amount: '10' }, schema, { lenient: false })).toEqual(['amount: must be a number']);
    expect(validatePayload({ accountId: 'ACC101', amount: '10' }, schema, { lenient: true })).toEqual([]);
  });
});
