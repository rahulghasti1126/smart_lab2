import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHl7Message } from '../machineIntegration/parsers/hl7Parser.js';
import { parseGp11Message } from '../machineIntegration/parsers/gp11Parser.js';
import { validateAnalyzerConfig } from '../machineIntegration/validation.js';

test('extracts only fields present in a standard HL7 PID/OBR/OBX message', () => {
  const parsed = parseHl7Message('MSH|^~\\&|Cippoint\rPID|1||PAT-1\rOBR|1|ORD-1|SAMPLE-1|TEST^Vitamin D\rOBX|1|NM|VITD^Vitamin D||42|ng/mL|20-50|N|||20260920120000');
  assert.equal(parsed.patientId, 'PAT-1');
  assert.equal(parsed.sampleId, 'SAMPLE-1');
  assert.equal(parsed.orderId, 'ORD-1');
  assert.equal(parsed.parameters.VITD.value, '42');
  assert.equal(parsed.parameters.VITD.unit, 'ng/mL');
});

test('keeps GP11 unimplemented until specification is supplied', () => {
  assert.throws(() => parseGp11Message('sample'), /GP11 protocol specification required/);
});

test('accepts Cippoint network client and server modes', () => {
  for (const tcpMode of ['CLIENT', 'SERVER']) {
    assert.equal(validateAnalyzerConfig({ name: 'Cippoint', ipAddress: '192.168.1.20', serverIp: '192.168.1.10', port: 5000, protocol: 'HL7', tcpMode }).valid, true);
  }
});
