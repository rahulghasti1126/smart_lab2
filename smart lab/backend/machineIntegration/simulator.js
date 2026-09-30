export const createSimulatorMessage = ({ sampleId = 'SIMULATED-SAMPLE-001', parameters = {} } = {}) => JSON.stringify({
  sampleId,
  parameters,
  simulated: true,
});
