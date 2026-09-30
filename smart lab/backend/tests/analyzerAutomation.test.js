import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackAnalyzerResult } from '../analyzerAutomation.js';

test('builds a fallback result payload for a patient', () => {
  const payload = buildFallbackAnalyzerResult({
    id: 'P123',
    name: 'Asha',
    test_type: 'Thyroid Profile (T3, T4, TSH)',
  }, 'Biochemistry Analyzer');

  assert.ok(payload);
  assert.equal(payload.patientId, 'P123');
  assert.equal(payload.testName, 'Thyroid Profile (T3, T4, TSH)');
  assert.equal(payload.machineName, 'Biochemistry Analyzer');
  assert.equal(payload.status, 'completed');
  assert.match(payload.resultValue, /\d/);
});
