const clean = (value) => String(value ?? '').replace(/[\x02\x03\x04\x05\x06\r\n]/g, '').trim();

const component = (value) => {
  const parts = clean(value).split('^').map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || '';
};

/**
 * Parses ASTM E1381/E1394 records already de-framed by the connection layer.
 * Vendors can move fields inside their ASTM profile, so unknown/malformed
 * records are rejected rather than guessed into a patient result.
 */
export const parseAstmMessage = (rawMessage) => {
  const lines = String(rawMessage || '')
    .replace(/\r\n/g, '\r')
    .split(/[\r\n]+/)
    .map((line) => line.replace(/^\d/, '').trim())
    .filter((line) => /^(H|P|O|R|L)\|/.test(line));

  if (!lines.length) {
    const error = new Error('The ASTM message contains no recognized ASTM records.');
    error.code = 'INVALID_ASTM_MESSAGE';
    throw error;
  }

  const patient = lines.find((line) => line.startsWith('P|'))?.split('|') || [];
  const order = lines.find((line) => line.startsWith('O|'))?.split('|') || [];
  const resultRecords = lines.filter((line) => line.startsWith('R|')).map((line) => line.split('|'));
  const parameters = {};

  for (const record of resultRecords) {
    const testCode = component(record[2]);
    if (!testCode) continue;
    parameters[testCode] = {
      testName: clean(record[2]) || testCode,
      value: clean(record[3]),
      unit: clean(record[4]),
      referenceRange: clean(record[5]),
      abnormalFlag: clean(record[6]),
      resultDateTime: clean(record[12] || record[11]),
    };
  }

  if (!Object.keys(parameters).length) {
    const error = new Error('The ASTM message contains no result records.');
    error.code = 'INVALID_ASTM_MESSAGE';
    throw error;
  }

  return {
    patientId: component(patient[3] || patient[2]),
    sampleId: component(order[2] || order[3]),
    barcode: component(order[2]),
    orderId: component(order[3]),
    testCode: component(order[4]),
    testName: clean(order[4]),
    parameters,
  };
};
