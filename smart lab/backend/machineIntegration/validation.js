const SUPPORTED_PROTOCOLS = new Set(['ASTM', 'HL7', 'GP11', 'CUSTOM', 'MANUFACTURER_SPECIFIC']);
const TCP_MODES = new Set(['CLIENT', 'SERVER']);
const NETWORK_CONNECTIONS = new Set(['ETHERNET', 'WIFI', 'NETWORK']);
const SERIAL_CONNECTIONS = new Set(['RS232', 'SERIAL', 'USB_SERIAL', 'USB']);

export const validateAnalyzerConfig = (input = {}) => {
  const errors = [];
  const port = Number(input.port);

  if (!String(input.name || '').trim()) errors.push('Analyzer name is required.');
  const connectionType = input.connectionType || input.connection_type || 'NETWORK';
  if (!NETWORK_CONNECTIONS.has(connectionType) && !SERIAL_CONNECTIONS.has(connectionType)) errors.push('Connection type is not supported.');
  if (NETWORK_CONNECTIONS.has(connectionType)) {
    if (!String(input.ipAddress || input.ip_address || '').trim()) errors.push('Analyzer IP address is required.');
    if (!String(input.serverIp || input.server_ip || '').trim()) errors.push('LIS/server IP is required.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('Port must be between 1 and 65535.');
  }
  if (SERIAL_CONNECTIONS.has(connectionType) && !String(input.serialPort || input.serial_port || '').trim()) errors.push('Serial port is required for RS-232/USB-serial.');
  if (!SUPPORTED_PROTOCOLS.has(input.protocol)) errors.push('Protocol must be ASTM, HL7, CUSTOM, GP11, or MANUFACTURER_SPECIFIC.');
  if (input.tcpMode !== undefined && !TCP_MODES.has(input.tcpMode)) errors.push('TCP mode must be CLIENT or SERVER.');

  return { valid: errors.length === 0, errors };
};

export const validateRawMessage = (rawMessage, maxBytes = 1024 * 1024) => {
  if (typeof rawMessage !== 'string' || !rawMessage.trim()) return { valid: false, error: 'Raw message is required.' };
  if (Buffer.byteLength(rawMessage, 'utf8') > maxBytes) return { valid: false, error: 'Raw message is too large.' };
  return { valid: true };
};
