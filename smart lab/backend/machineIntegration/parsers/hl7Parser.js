const field = (segment, index) => segment?.[index]?.trim() || '';

const firstComponent = (value) => value?.split('^')?.[0]?.trim() || '';

export const parseHl7Message = (rawMessage) => {
  const segments = rawMessage
    .replace(/^\x0b/, '')
    .replace(/\x1c\r?$/, '')
    .replace(/\r\n/g, '\r')
    .replace(/\n/g, '\r')
    .split('\r')
    .filter(Boolean)
    .map((line) => line.split('|'));
  if (!segments.some((segment) => segment[0] === 'MSH')) {
    const error = new Error('The HL7 message is missing an MSH segment.');
    error.code = 'INVALID_HL7_MESSAGE';
    throw error;
  }
  const pid = segments.find((segment) => segment[0] === 'PID');
  const obr = segments.find((segment) => segment[0] === 'OBR');
  const obxSegments = segments.filter((segment) => segment[0] === 'OBX');
  const parameters = {};

  for (const obx of obxSegments) {
    const testCode = firstComponent(field(obx, 3));
    if (!testCode) continue;
    parameters[testCode] = {
      testName: field(obx, 3),
      value: field(obx, 5),
      unit: field(obx, 6),
      referenceRange: field(obx, 7),
      abnormalFlag: field(obx, 8),
      resultDateTime: field(obx, 14),
    };
  }

  if (!Object.keys(parameters).length) {
    const error = new Error('The HL7 message contains no OBX result segments.');
    error.code = 'INVALID_HL7_MESSAGE';
    throw error;
  }

  return {
    patientId: firstComponent(field(pid, 3)),
    sampleId: firstComponent(field(obr, 3)) || firstComponent(field(pid, 3)),
    orderId: firstComponent(field(obr, 2)),
    barcode: firstComponent(field(obr, 3)),
    testCode: firstComponent(field(obr, 4)),
    testName: field(obr, 4),
    parameters,
  };
};
