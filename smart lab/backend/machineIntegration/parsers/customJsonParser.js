const protocolError = (message) => {
  const error = new Error(message);
  error.code = 'PROTOCOL_SPECIFICATION_REQUIRED';
  return error;
};

/**
 * A deliberately narrow custom bridge contract.  It is not a claim that a
 * vendor speaks JSON: a vendor adapter/SDK must translate its documented
 * protocol to this contract before forwarding it to the LIS.
 */
export const parseCustomJsonMessage = (rawMessage) => {
  let payload;
  try {
    payload = JSON.parse(rawMessage);
  } catch {
    throw protocolError('CUSTOM requires a documented vendor mapping or the Smart Lab JSON bridge contract.');
  }

  const rows = Array.isArray(payload.results) ? payload.results : [];
  if (!payload.sampleId || !rows.length) {
    throw protocolError('CUSTOM JSON bridge requires sampleId and a non-empty results array.');
  }

  const parameters = {};
  for (const row of rows) {
    const testCode = String(row.testCode || '').trim();
    if (!testCode || row.resultValue === undefined || row.resultValue === null) {
      throw protocolError('Each CUSTOM result requires testCode and resultValue.');
    }
    parameters[testCode] = {
      testName: String(row.testName || testCode),
      value: String(row.resultValue),
      unit: String(row.unit || ''),
      referenceRange: String(row.referenceRange || ''),
      abnormalFlag: String(row.abnormalFlag || ''),
      resultDateTime: String(row.timestamp || ''),
    };
  }

  return {
    patientId: String(payload.patientId || ''),
    sampleId: String(payload.sampleId),
    barcode: String(payload.barcode || ''),
    orderId: String(payload.orderId || ''),
    parameters,
  };
};
