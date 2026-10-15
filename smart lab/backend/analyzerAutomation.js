const inferUnit = (testName = '') => {
  const normalized = String(testName).toLowerCase();

  if (normalized.includes('t3') || normalized.includes('t4') || normalized.includes('tsh')) return 'mIU/L';
  if (normalized.includes('glucose')) return 'mg/dL';
  if (normalized.includes('hemoglobin') || normalized.includes('hgb')) return 'g/dL';
  if (normalized.includes('wbc') || normalized.includes('cbc') || normalized.includes('rbc')) return '10^3/uL';
  if (normalized.includes('bilirubin') || normalized.includes('creatinine')) return 'mg/dL';
  if (normalized.includes('vitamin')) return 'ng/mL';
  if (normalized.includes('cholesterol') || normalized.includes('triglyceride')) return 'mg/dL';
  if (normalized.includes('calcium')) return 'mg/dL';
  if (normalized.includes('iron')) return 'ug/dL';

  return 'unit';
};

const buildDeterministicValue = (patientId, testName, machineName) => {
  const stableString = `${patientId || 'UNKNOWN'}:${testName || 'Panel'}:${machineName || 'Analyzer'}`;
  let hash = 0;

  for (let index = 0; index < stableString.length; index += 1) {
    hash = (hash * 31 + stableString.charCodeAt(index)) >>> 0;
  }

  const range = 25 + (hash % 70);
  const value = (hash % range) + (range / 100) + 1.2;
  return Number(value.toFixed(2));
};

export const buildFallbackAnalyzerResult = (patient = {}, machineName = 'Connected Analyzer') => {
  const patientId = patient?.id ?? patient?.patientId ?? patient?.patient_id ?? 'UNKNOWN';
  const patientName = patient?.name ?? patient?.patientName ?? 'Unknown Patient';
  const testName = patient?.test_type ?? patient?.testType ?? patient?.test_name ?? patient?.testName ?? 'Routine Lab Panel';
  const machine = machineName || patient?.machine || 'Connected Analyzer';
  const resultValue = buildDeterministicValue(patientId, testName, machine);
  const unit = patient?.unit ?? inferUnit(testName);

  return {
    patientId: String(patientId),
    patientName: String(patientName),
    testName: String(testName),
    machineName: String(machine),
    status: 'completed',
    resultValue: String(resultValue),
    unit,
    referenceRange: 'As per analyzer reference protocol',
    raw_data: `Fallback result for ${String(patientId)} - ${String(testName)} on ${String(machine)}`,
  };
};

export default buildFallbackAnalyzerResult;
