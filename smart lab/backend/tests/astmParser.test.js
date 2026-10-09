import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAstmMessage } from '../machineIntegration/parsers/astmParser.js';

test('parses ASTM order and result records into a normalized parser contract', () => {
  const message = 'H|\\^&|||LAB\rP|1||PAT-7\rO|1|LAB-20261008-0001|ORD-1|^^^CHEM\rR|1|^^^GLU|105|mg/dL|70-99|H\rL|1|N';
  const parsed = parseAstmMessage(message);
  assert.equal(parsed.patientId, 'PAT-7');
  assert.equal(parsed.sampleId, 'LAB-20261008-0001');
  assert.equal(parsed.parameters.GLU.value, '105');
  assert.equal(parsed.parameters.GLU.unit, 'mg/dL');
  assert.equal(parsed.parameters.GLU.abnormalFlag, 'H');
});
