import { describe, expect, it } from 'vitest';
import { applyMappings } from '../../src/transform/mapping';

describe('U1 Req 3 – declarative mapping (FR-05)', () => {
  it('3.1 renames and nests with dot paths', () => {
    const { output, errors } = applyMappings({ a: { b: 'x' } }, [{ from: 'a.b', to: 'Outer.Inner' }]);
    expect(errors).toEqual([]);
    expect(output).toEqual({ Outer: { Inner: 'x' } });
  });

  it('3.1 adds the SOAP prefix to every output segment', () => {
    const { output } = applyMappings({ id: 'ACC101' }, [{ from: 'id', to: 'Account.Number' }], { prefix: 'ns:' });
    expect(output).toEqual({ 'ns:Account': { 'ns:Number': 'ACC101' } });
  });

  it('3.2 converts number, integer, boolean and string, and reports failures by path', () => {
    const { output, errors } = applyMappings(
      { n: '50000.50', i: '7', b: 'Y', s: 12, bad: 'abc', frac: '1.5' },
      [
        { from: 'n', to: 'n', type: 'number' },
        { from: 'i', to: 'i', type: 'integer' },
        { from: 'b', to: 'b', type: 'boolean' },
        { from: 's', to: 's', type: 'string' },
        { from: 'bad', to: 'bad', type: 'number' },
        { from: 'frac', to: 'frac', type: 'integer' },
      ],
    );
    expect(output).toEqual({ n: 50000.5, i: 7, b: true, s: '12' });
    expect(errors).toEqual(['bad: is not a number', 'frac: is not an integer']);
  });

  it('3.3 converts legacy date formats both ways and rejects invalid dates', () => {
    const { output, errors } = applyMappings(
      { legacy: '20261118', iso: '2026-11-01', dmy: '20112026', bad: '20261340' },
      [
        { from: 'legacy', to: 'a', type: 'date', sourceFormat: 'yyyyMMdd', targetFormat: 'iso' },
        { from: 'iso', to: 'b', type: 'date', sourceFormat: 'iso', targetFormat: 'yyyyMMdd' },
        { from: 'dmy', to: 'c', type: 'date', sourceFormat: 'ddMMyyyy', targetFormat: 'iso' },
        { from: 'bad', to: 'd', type: 'date', sourceFormat: 'yyyyMMdd' },
      ],
    );
    expect(output).toEqual({ a: '2026-11-18', b: '20261101', c: '2026-11-20' });
    expect(errors).toEqual(['bad: is not a valid yyyyMMdd date']);
  });

  it('3.4 applies lookups and keeps unknown values', () => {
    const rules = [{ from: 'c', to: 't', lookup: { CR: 'credit', DR: 'debit' } }];
    expect(applyMappings({ c: 'DR' }, rules).output).toEqual({ t: 'debit' });
    expect(applyMappings({ c: 'XX' }, rules).output).toEqual({ t: 'XX' });
  });

  it('3.5 uses defaults, reports required fields and omits optional missing fields', () => {
    const { output, errors } = applyMappings({}, [
      { from: 'currency', to: 'Currency', default: 'INR' },
      { from: 'id', to: 'Id', required: true },
      { from: 'note', to: 'Note' },
    ]);
    expect(output).toEqual({ Currency: 'INR' });
    expect(errors).toEqual(['id: is required']);
  });

  it('3.6 maps repeating elements, treating a single element as a one-element array', () => {
    const rules = [{ from: 'List.Item', to: 'items', items: [{ from: 'V', to: 'value', type: 'number' as const }] }];
    expect(applyMappings({ List: { Item: [{ V: '1' }, { V: '2' }] } }, rules).output).toEqual({ items: [{ value: 1 }, { value: 2 }] });
    expect(applyMappings({ List: { Item: { V: '3' } } }, rules).output).toEqual({ items: [{ value: 3 }] });
  });

  it('3.6 reports item errors with their index', () => {
    const rules = [{ from: 'L', to: 'l', items: [{ from: 'V', to: 'v', type: 'number' as const }] }];
    expect(applyMappings({ L: [{ V: '1' }, { V: 'x' }] }, rules).errors).toEqual(['L[1].V: is not a number']);
  });

  it('3.7 maps repeating primitive values', () => {
    const { output } = applyMappings({ factors: ['a', 'b'] }, [{ from: 'factors', to: 'Factors.Factor', array: true }], { prefix: 'ns:' });
    expect(output).toEqual({ 'ns:Factors': { 'ns:Factor': ['a', 'b'] } });
  });

  it('3.8 reads the text of elements that have attributes', () => {
    const { output } = applyMappings({ Amount: { '#text': '5', '@_currency': 'INR' } }, [{ from: 'Amount', to: 'amount', type: 'number' }]);
    expect(output).toEqual({ amount: 5 });
  });
});
