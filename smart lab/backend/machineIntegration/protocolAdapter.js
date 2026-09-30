export class ProtocolUnavailableError extends Error {
  constructor(protocol) {
    super(`No ${protocol} parser is configured for this analyzer.`);
    this.name = 'ProtocolUnavailableError';
    this.code = 'PROTOCOL_UNAVAILABLE';
  }
}

export const createProtocolAdapter = ({ protocol, parser } = {}) => ({
  protocol,
  parse(rawMessage) {
    if (typeof parser !== 'function') throw new ProtocolUnavailableError(protocol || 'unknown');
    return parser(rawMessage);
  },
});
