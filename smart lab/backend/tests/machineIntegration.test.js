import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnalyzerConfig, validateRawMessage } from '../machineIntegration/validation.js';
import { createSimulatorMessage } from '../machineIntegration/simulator.js';

test('validates configurable analyzer settings', () => {
  const result = validateAnalyzerConfig({
    name: 'DIRUI iCount3 TS',
    ipAddress: '192.168.1.20',
    serverIp: '192.168.1.10',
    port: 5000,
    protocol: 'MANUFACTURER_SPECIFIC',
  });

  assert.equal(result.valid, true);
});

test('rejects invalid analyzer port and protocol', () => {
  const result = validateAnalyzerConfig({ name: 'Analyzer', ipAddress: '127.0.0.1', serverIp: '127.0.0.1', port: 0, protocol: 'UNKNOWN' });
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});

test('validates raw messages and creates simulator payloads', () => {
  const raw = createSimulatorMessage({ sampleId: 'CBC-001', parameters: { WBC: '5.2' } });
  assert.equal(validateRawMessage(raw).valid, true);
  assert.match(raw, /CBC-001/);
});
