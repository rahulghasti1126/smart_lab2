import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulatorMessage } from '../machineIntegration/simulator.js';
import { parseHl7Message } from '../machineIntegration/parsers/hl7Parser.js';

test('simulator uses a parseable protocol message instead of inventing clinical values in a fallback path', () => {
  const raw = createSimulatorMessage({
    protocol: 'HL7',
    sampleId: 'LAB-20261008-0001',
    patientId: 'P123',
    parameters: { GLU: { value: '95', unit: 'mg/dL', referenceRange: '70-99', abnormalFlag: 'N' } },
  });

  const parsed = parseHl7Message(raw);
  assert.equal(parsed.sampleId, 'LAB-20261008-0001');
  assert.equal(parsed.parameters.GLU.value, '95');
});
