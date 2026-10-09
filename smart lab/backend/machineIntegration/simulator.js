const defaults = { GLU: { value: '95', unit: 'mg/dL', referenceRange: '70-99', abnormalFlag: 'N', testName: 'Glucose' } };

export const createSimulatorMessage = ({ protocol = 'HL7', sampleId = 'SIMULATED-SAMPLE-001', patientId = 'SIMULATED-PATIENT', parameters = defaults } = {}) => {
  const entries = Object.entries(Object.keys(parameters).length ? parameters : defaults).map(([testCode, result]) => ({
    testCode,
    testName: result.testName || testCode,
    value: result.value ?? result,
    unit: result.unit || '',
    referenceRange: result.referenceRange || '',
    abnormalFlag: result.abnormalFlag || '',
  }));
  if (protocol === 'HL7') {
    return [
      `MSH|^~\\&|SMARTLAB_SIM|LIS|||${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}||ORU^R01|SIM-${Date.now()}|P|2.3`,
      `PID|1||${patientId}`,
      `OBR|1|SIM-${Date.now()}|${sampleId}|SIM^Simulator panel`,
      ...entries.map((row, index) => `OBX|${index + 1}|ST|${row.testCode}^${row.testName}||${row.value}|${row.unit}|${row.referenceRange}|${row.abnormalFlag}|||||${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`),
    ].join('\r');
  }
  if (protocol === 'ASTM') {
    return [
      'H|\\^&|||SMARTLAB_SIM|||||P|1',
      `P|1||${patientId}`,
      `O|1|${sampleId}|SIM-${Date.now()}|^^^SIM`,
      ...entries.map((row, index) => `R|${index + 1}|^^^${row.testCode}|${row.value}|${row.unit}|${row.referenceRange}|${row.abnormalFlag}`),
      'L|1|N',
    ].join('\r');
  }
  if (protocol === 'CUSTOM') {
    return JSON.stringify({ sampleId, patientId, results: entries.map((row) => ({ testCode: row.testCode, testName: row.testName, resultValue: row.value, unit: row.unit, referenceRange: row.referenceRange, abnormalFlag: row.abnormalFlag })) });
  }
  const error = new Error(`Simulator cannot generate ${protocol}. Vendor protocol documentation is required.`);
  error.code = 'PROTOCOL_SPECIFICATION_REQUIRED';
  throw error;
};
