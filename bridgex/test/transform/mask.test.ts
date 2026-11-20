import { describe, expect, it } from 'vitest';
import { collectSensitive, createMasker, maskValue } from '../../src/transform/mask';

describe('U1 Req 7 – masking (FR-13, NFR-01)', () => {
  it('7.2 keeps only the last three characters of sensitive values', () => {
    expect(maskValue('ACC101')).toBe('***101');
    expect(maskValue('abc')).toBe('***');
  });

  it('7.2 hides sensitive values and secrets in text', () => {
    const mask = createMasker(['ACC101', 'ACC102'], ['s3cretPassw0rd']);
    expect(mask('<From>ACC101</From><To>ACC102</To><Password>s3cretPassw0rd</Password>')).toBe(
      '<From>***101</From><To>***102</To><Password>********</Password>',
    );
  });

  it('7.2 replaces longer values first', () => {
    const mask = createMasker(['ACC1011', 'ACC101'], []);
    expect(mask('ACC1011 ACC101')).toBe('***011 ***101');
  });

  it('7.1 collects sensitive values, including inside repeating items', () => {
    const rules = [
      { from: 'id', to: 'Id', sensitive: true },
      { from: 'name', to: 'Name' },
      { from: 'list', to: 'List', items: [{ from: 'acc', to: 'Acc', sensitive: true }] },
    ];
    expect(collectSensitive({ id: 'ACC101', name: 'x', list: [{ acc: 'ACC102' }, { acc: 'ACC103' }] }, rules)).toEqual(['ACC101', 'ACC102', 'ACC103']);
  });
});
