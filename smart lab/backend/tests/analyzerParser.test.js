import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalyzerData } from '../analyzerParser.js';

test('parses pipe-delimited analyzer result', () => {
  const parsed = parseAnalyzerData('P1001|T3|2.5|ng/mL|0.5-5.0');

  assert.ok(parsed);
  assert.equal(parsed.patientId, 'P1001');
  assert.equal(parsed.testName, 'T3');
  assert.equal(parsed.resultValue, '2.5');
  assert.equal(parsed.unit, 'ng/mL');
  assert.equal(parsed.status, 'completed');
});

test('parses comma-delimited analyzer result', () => {
  const parsed = parseAnalyzerData('P2002,T4,4.8,ug/dL');

  assert.ok(parsed);
  assert.equal(parsed.patientId, 'P2002');
  assert.equal(parsed.testName, 'T4');
  assert.equal(parsed.resultValue, '4.8');
  assert.equal(parsed.unit, 'ug/dL');
  assert.equal(parsed.status, 'completed');
});

test('falls back to a generic result when format is unknown', () => {
  const parsed = parseAnalyzerData('Immunoassay analyzer sample received');

  assert.ok(parsed);
  assert.equal(parsed.patientId, null);
  assert.equal(parsed.testName, 'Analyzer Data');
  assert.equal(parsed.resultValue, 'Immunoassay analyzer sample received');
  assert.equal(parsed.status, 'pending');
});
