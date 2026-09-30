import { createProtocolAdapter } from './protocolAdapter.js';
import { parseHl7Message } from './parsers/hl7Parser.js';
import { parseGp11Message } from './parsers/gp11Parser.js';

const adapters = new Map();

export const registerProtocolAdapter = (protocol, parser) => {
  adapters.set(protocol, createProtocolAdapter({ protocol, parser }));
};

export const getProtocolAdapter = (protocol) => adapters.get(protocol) || createProtocolAdapter({ protocol });

registerProtocolAdapter('HL7', parseHl7Message);
registerProtocolAdapter('GP11', parseGp11Message);
registerProtocolAdapter('MANUFACTURER_SPECIFIC', parseGp11Message);
