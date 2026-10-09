import test from 'node:test';
import assert from 'node:assert/strict';
import { createMachineIntegrationService } from '../machineIntegration/service.js';

test('matches only the exact Sample ID and places normalized data in validation', async () => {
  const savedSample = { _id: 'sample-record', sample_id: 'LAB-20261008-0001', patient_id: 'P-1', status: 'ASSIGNED', save: async function save() { this.saved = true; } };
  const upserts = [];
  const service = createMachineIntegrationService({
    AnalyzerMessage: { findOne: async () => null, create: async (row) => ({ _id: 'msg-1', ...row }), findByIdAndUpdate: async () => {} },
    AnalyzerResult: { create: async (row) => ({ _id: 'result-1', ...row }) },
    Sample: { findOne: async ({ sample_id }) => sample_id === savedSample.sample_id ? savedSample : null },
    Test: { findOne: async () => ({ test_id: 'T-1' }) },
    Result: { findOneAndUpdate: async (...args) => { upserts.push(args); } },
    AuditLog: { create: async () => {} },
  });

  const received = await service.receiveRawMessage({
    analyzer: { _id: 'analyzer-1', name: 'Chemistry', protocol: 'HL7' },
    rawMessage: 'MSH|^~\\&|CHEM\rPID|1||P-1\rOBR|1|ORD-1|LAB-20261008-0001|GLU^Glucose\rOBX|1|NM|GLU^Glucose||105|mg/dL|70-99|H',
  });

  assert.equal(received.matched, true);
  assert.equal(received.result.processing_status, 'VALIDATION_PENDING');
  assert.equal(received.normalizedResults[0].abnormalFlag, 'High');
  assert.equal(savedSample.status, 'VALIDATION_PENDING');
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0][0].sample_id, 'LAB-20261008-0001');
});
