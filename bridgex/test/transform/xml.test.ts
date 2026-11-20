import { describe, expect, it } from 'vitest';
import { BridgeError } from '../../src/transform/errors';
import { buildXml, MAX_PAYLOAD_BYTES, parseXml } from '../../src/transform/xml';

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof BridgeError ? error.code : 'NOT_A_BRIDGE_ERROR';
  }
  return undefined;
}

describe('U1 Req 1 – safe XML parsing (NFR-01)', () => {
  it('1.1 rejects DOCTYPE and ENTITY declarations before parsing', () => {
    expect(codeOf(() => parseXml('<!DOCTYPE a [<!ENTITY x "boom">]><a>&x;</a>'))).toBe('INVALID_PAYLOAD');
    expect(codeOf(() => parseXml('<?xml version="1.0"?><!doctype a SYSTEM "file:///etc/passwd"><a/>'))).toBe('INVALID_PAYLOAD');
  });

  it('1.2 rejects payloads over 64 KB', () => {
    const big = `<a>${'x'.repeat(MAX_PAYLOAD_BYTES)}</a>`;
    expect(codeOf(() => parseXml(big))).toBe('PAYLOAD_TOO_LARGE');
  });

  it('1.3 rejects malformed XML and non-XML text', () => {
    expect(codeOf(() => parseXml('<a><b></a>'))).toBe('INVALID_PAYLOAD');
    expect(codeOf(() => parseXml('{"json":true}'))).toBe('INVALID_PAYLOAD');
  });

  it('1.4 removes namespace prefixes and keeps values as strings', () => {
    const doc = parseXml('<x:Root xmlns:x="urn:x"><x:Amount>50000</x:Amount><x:Flag>true</x:Flag></x:Root>');
    expect(doc).toEqual({ Root: { Amount: '50000', Flag: 'true' } });
  });

  it('1.5 escapes special characters when building', () => {
    const xml = buildXml({ Note: `a<b>&"c'` });
    expect(xml).toContain('<Note>a&lt;b&gt;&amp;&quot;c&apos;</Note>');
    expect(parseXml(xml)).toEqual({ Note: `a<b>&"c'` });
  });

  it('1.5 cannot be used to inject elements', () => {
    const xml = buildXml({ Reference: '</Reference><Amount>999999</Amount><Reference>' });
    expect(parseXml(xml)).toEqual({ Reference: '</Reference><Amount>999999</Amount><Reference>' });
  });
});
