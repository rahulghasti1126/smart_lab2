const SUPPORTED_PROTOCOLS = new Set(['ASTM', 'HL7', 'GP11', 'MANUFACTURER_SPECIFIC']);
const TCP_MODES = new Set(['CLIENT', 'SERVER']);

export const validateAnalyzerConfig = (input = {}) => {
  const errors = [];
  const port = Number(input.port);

  if (!String(input.name || '').trim()) errors.push('Analyzer name is required.');
  if (!String(input.ipAddress || '').trim()) errors.push('Analyzer IP address is required.');
  if (!String(input.serverIp || '').trim()) errors.push('LIS/server IP is required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('Port must be between 1 and 65535.');
  if (!SUPPORTED_PROTOCOLS.has(input.protocol)) errors.push('Protocol must be ASTM, HL7, GP11, or MANUFACTURER_SPECIFIC.');
  if (input.tcpMode !== undefined && !TCP_MODES.has(input.tcpMode)) errors.push('TCP mode must be CLIENT or SERVER.');

  return { valid: errors.length === 0, errors };
};

export const validateRawMessage = (rawMessage, maxBytes = 1024 * 1024) => {
  if (typeof rawMessage !== 'string' || !rawMessage.trim()) return { valid: false, error: 'Raw message is required.' };
  if (Buffer.byteLength(rawMessage, 'utf8') > maxBytes) return { valid: false, error: 'Raw message is too large.' };
  return { valid: true };
};
