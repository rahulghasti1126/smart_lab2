const field = (segment, index) => segment?.[index]?.trim() || '';

const firstComponent = (value) => value?.split('^')?.[0]?.trim() || '';

export const parseHl7Message = (rawMessage) => {
  const segments = rawMessage.replace(/\r\n/g, '\r').replace(/\n/g, '\r').split('\r').filter(Boolean).map((line) => line.split('|'));
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
