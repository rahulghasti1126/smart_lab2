import test from 'node:test';
import assert from 'node:assert/strict';
import { createMachineIntegrationService } from '../machineIntegration/service.js';

test('parses incoming HL7 messages and stores analyzer results', async () => {
  const updates = [];
  const results = [];
  const events = [];
  const AnalyzerMessage = {
    findOne: async () => null,
    create: async (record) => ({ _id: 'message-1', ...record }),
    findByIdAndUpdate: async (id, update) => updates.push({ id, update }),
  };
  const AnalyzerResult = {
    create: async (record) => {
      const result = { _id: 'result-1', ...record };
      results.push(result);
      return result;
    },
  };
  const service = createMachineIntegrationService({
    AnalyzerMessage,
    AnalyzerResult,
    AuditLog: { create: async () => {} },
    emit: (event, payload) => events.push({ event, payload }),
  });

  const received = await service.receiveRawMessage({
    analyzer: { _id: 'analyzer-1', name: 'Cippoint', protocol: 'HL7' },
    rawMessage: 'MSH|^~\\&|Cippoint\rPID|1||PAT-1\rOBR|1|ORD-1|SAMPLE-1|TEST^Vitamin D\rOBX|1|NM|VITD^Vitamin D||42|ng/mL|20-50|N|||20260920120000',
    source: 'local-gateway',
  });

  assert.equal(received.result._id, 'result-1');
  assert.equal(results[0].patient_id, 'PAT-1');
  assert.equal(results[0].sample_id, 'SAMPLE-1');
  assert.equal(results[0].order_id, 'ORD-1');
  assert.equal(results[0].parameters.VITD.value, '42');
  assert.equal(results[0].processing_status, 'UNMATCHED');
  assert.deepEqual(updates[0], { id: 'message-1', update: { processing_status: 'UNMATCHED' } });
  assert.equal(events.some(({ event }) => event === 'machine-result-received'), true);
});

test('rejects malformed protocol data instead of storing a fake result', async () => {
  let resultCreated = false;
  const service = createMachineIntegrationService({
    AnalyzerMessage: {
      findOne: async () => null,
      create: async (record) => ({ _id: 'message-1', ...record }),
      findByIdAndUpdate: async () => {},
    },
    AnalyzerResult: { create: async () => { resultCreated = true; } },
    AuditLog: { create: async () => {} },
  });

  await assert.rejects(() => service.receiveRawMessage({
    analyzer: { _id: 'analyzer-1', name: 'Cippoint', protocol: 'HL7' }, rawMessage: 'raw test message',
  }), /missing an MSH/);
  assert.equal(resultCreated, false);
});
