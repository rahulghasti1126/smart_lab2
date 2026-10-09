const isNumeric = (v) => {
  if (v === null || v === undefined) return false;
  const n = `${v}`.trim();
  return n !== '' && !Number.isNaN(Number(n));
};

const tryParseKeyValue = (text) => {
  // Example: "RBC:4.5,HGB:13.2" or "RBC:4.5|HGB:13.2"
  const parts = text.split(/[,|;\t]+/).map((p) => p.trim()).filter(Boolean);
  const pairs = parts.map((p) => {
    const idx = p.indexOf(':');
    if (idx > 0) return { k: p.slice(0, idx).trim(), v: p.slice(idx + 1).trim() };
    return null;
  }).filter(Boolean);
  if (pairs.length === 0) return null;
  // take first pair as primary test
  return { testName: pairs[0].k, resultValue: pairs[0].v, unit: '' };
};

const parseAnalyzerData = (data) => {
  const text = `${data || ''}`.trim();
  if (!text) return null;
  const normalized = text.replace(/\r/g, '').trim();

  // Fast path: key:value pairs
  const kv = tryParseKeyValue(normalized);
  if (kv) {
    return {
      patientId: null,
      testName: kv.testName || 'Analyzer Test',
      resultValue: kv.resultValue || '',
      unit: kv.unit || '',
      referenceRange: '',
      machineName: 'Connected Machine',
      status: isNumeric(kv.resultValue) ? 'completed' : 'pending',
      raw_data: normalized,
    };
  }

  // Tokenize by common separators
  const tokens = normalized.split(/[|,;\t]+/).map((t) => t.trim()).filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  // Pattern: P123 | TEST | 4.5 | mg/dL
  if (tokens.length >= 3) {
    const maybePatientId = tokens[0]?.toUpperCase()?.startsWith('P') ? tokens[0] : null;
    const testName = maybePatientId ? tokens[1] : tokens[0];
    const resultValue = maybePatientId ? tokens[2] : tokens[1] || '';
    const unit = maybePatientId ? tokens[3] || '' : tokens[2] || '';
    const referenceRange = maybePatientId ? tokens[4] || '' : tokens[3] || '';
    const machineName = tokens.slice(-1)[0] || 'Connected Machine';
    const status = `${resultValue}`.toLowerCase().includes('error') ? 'error' : (maybePatientId ? 'completed' : (isNumeric(resultValue) ? 'completed' : 'pending'));

    return {
      patientId: maybePatientId,
      testName: testName || 'Analyzer Test',
      resultValue: resultValue || '',
      unit,
      referenceRange,
      machineName: machineName || 'Connected Machine',
      status,
      raw_data: normalized,
    };
  }

  // Fallback for two tokens
  if (tokens.length === 2) {
    const maybePatientId = tokens[0]?.toUpperCase()?.startsWith('P') ? tokens[0] : null;
    if (maybePatientId) {
      return {
        patientId: maybePatientId,
        testName: tokens[1] || 'Analyzer Test',
        resultValue: '',
        unit: '',
        referenceRange: '',
        machineName: 'Connected Machine',
        status: 'pending',
        raw_data: normalized,
      };
    }

    // maybe "TEST 4.5"
    return {
      patientId: null,
      testName: tokens[0] || 'Analyzer Test',
      resultValue: tokens[1] || '',
      unit: '',
      referenceRange: '',
      machineName: 'Connected Machine',
      status: isNumeric(tokens[1]) ? 'completed' : 'pending',
      raw_data: normalized,
    };
  }

  // An unrecognized payload is raw diagnostic material, not a clinical
  // result. The protocol adapter will retain it for investigation.
  return null;
};

export { parseAnalyzerData };
