import { describe, expect, it } from 'vitest';
import { suggestMappings, type ModelInvoker, type ToolCall } from '../../src/gateway/ai-mapping';

const source = {
  format: 'xml' as const,
  sample:
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><GetLoanStatusResponse><LoanNo>LN77</LoanNo><Outstanding>125000.00</Outstanding><NextDue>20261205</NextDue><Stat>A</Stat><Schedule><Inst><No>1</No><Amt>5000</Amt></Inst><Inst><No>2</No><Amt>5000</Amt></Inst></Schedule></GetLoanStatusResponse></soapenv:Body></soapenv:Envelope>',
};
const target = {
  format: 'json' as const,
  sample: '{"loanId":"LN77","outstanding":125000,"nextDueDate":"2026-12-05","status":"active","installments":[{"number":1,"amount":5000}]}',
};

const fake = (mappings: unknown): { invoke: ModelInvoker; calls: ToolCall[] } => {
  const calls: ToolCall[] = [];
  return {
    calls,
    invoke: async (call) => {
      calls.push(call);
      return { mappings };
    },
  };
};

describe('U6 Req 1 – AI mapping suggestions (FR-18)', () => {
  it('1.1 sends both path lists to the model with a forced tool', async () => {
    const { invoke, calls } = fake([]);
    await suggestMappings({ source, target }, invoke, 'test-model');
    expect(calls[0]?.toolName).toBe('propose_mappings');
    expect(calls[0]?.prompt).toContain('- Schedule.Inst[].Amt');
    expect(calls[0]?.prompt).toContain('- installments[].amount');
  });

  it('1.3/1.4 validates paths, flags invented ones and builds a draft with items', async () => {
    const { invoke } = fake([
      { from: 'LoanNo', to: 'loanId', confidence: 0.98, reason: 'Same identifier' },
      { from: 'Outstanding', to: 'outstanding', type: 'number', confidence: 0.95, reason: 'Amount' },
      { from: 'NextDue', to: 'nextDueDate', type: 'date', sourceFormat: 'yyyyMMdd', targetFormat: 'iso', confidence: 0.9, reason: 'Date formats differ' },
      { from: 'Stat', to: 'status', lookup: { A: 'active' }, confidence: 0.7, reason: 'Status code' },
      { from: 'Schedule.Inst[].Amt', to: 'installments[].amount', type: 'number', confidence: 0.9, reason: 'Instalment amount' },
      { from: 'Borrower', to: 'customerName', confidence: 0.4, reason: 'Guess' },
      { from: 'Schedule.Inst[].No', to: 'loanId', confidence: 0.2, reason: 'Wrong shape' },
    ]);
    const result = await suggestMappings({ source, target }, invoke, 'test-model');
    expect(result.suggestions.filter((s) => !s.valid).map((s) => s.from)).toEqual(['Borrower', 'Schedule.Inst[].No']);
    expect(result.draft).toEqual([
      { from: 'LoanNo', to: 'loanId' },
      { from: 'Outstanding', to: 'outstanding', type: 'number' },
      { from: 'NextDue', to: 'nextDueDate', type: 'date', sourceFormat: 'yyyyMMdd', targetFormat: 'iso' },
      { from: 'Stat', to: 'status', lookup: { A: 'active' } },
      { from: 'Schedule.Inst', to: 'installments', items: [{ from: 'Amt', to: 'amount', type: 'number' }] },
    ]);
    expect(result.unmappedTargets).toEqual(['installments[].number']);
  });

  it('1.5 rejects unparsable samples without calling the model', async () => {
    const { invoke, calls } = fake([]);
    await expect(suggestMappings({ source: { format: 'xml', sample: '<a>' }, target }, invoke, 'm')).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    await expect(suggestMappings({ source, target: { format: 'json', sample: 'nope' } }, invoke, 'm')).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    expect(calls).toHaveLength(0);
  });

  it('1.6 reports AI_UNAVAILABLE when the model fails or returns no tool call', async () => {
    await expect(suggestMappings({ source, target }, async () => undefined, 'm')).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', status: 502 });
    await expect(
      suggestMappings({ source, target }, async () => {
        throw new Error('ThrottlingException');
      }, 'm'),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });
});
