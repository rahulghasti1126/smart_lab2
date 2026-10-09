import { TcpClientAdapter, TcpServerAdapter } from './tcpAdapter.js';
import { SerialAdapter } from './serialAdapter.js';

const NETWORK_TYPES = new Set(['ETHERNET', 'WIFI', 'NETWORK']);
const SERIAL_TYPES = new Set(['RS232', 'SERIAL', 'USB_SERIAL', 'USB']);

const buildHl7Ack = (rawMessage, accepted, errorText = '') => {
  const msh = String(rawMessage).replace(/^\x0b/, '').split(/\r|\n/).find((row) => row.startsWith('MSH|'))?.split('|');
  if (!msh) return '';
  const controlId = msh[9] || '';
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const body = `MSH|^~\\&|SMARTLAB|LIS|${msh[2] || 'ANALYZER'}|${msh[3] || ''}|${timestamp}||ACK|ACK-${Date.now()}|P|2.3\rMSA|${accepted ? 'AA' : 'AE'}|${controlId}${errorText ? `|${errorText}` : ''}\r`;
  return rawMessage.startsWith('\x0b') ? `\x0b${body}\x1c\r` : body;
};

export class AnalyzerConnectionManager {
  constructor({ AnalyzerConfig, AuditLog, machineIntegration, emit }) {
    this.AnalyzerConfig = AnalyzerConfig;
    this.AuditLog = AuditLog;
    this.machineIntegration = machineIntegration;
    this.emit = emit;
    this.adapters = new Map();
  }

  #create(analyzer) {
    const connectionType = analyzer.connection_type || 'NETWORK';
    const onStatus = async (status, details = {}) => {
      await this.AnalyzerConfig.findByIdAndUpdate(analyzer._id, { connection_status: status, updated_at: new Date().toISOString() });
      this.emit?.('machine-integration-status', { analyzerId: analyzer._id, status, details });
    };
    const onMessage = async (rawMessage, details) => {
      try {
        const received = await this.machineIntegration.receiveRawMessage({ analyzer, rawMessage, sourceIp: details.sourceIp, connectionAt: details.connectionAt, source: connectionType });
        if (analyzer.protocol === 'HL7' && analyzer.protocol_options?.send_ack !== false) {
          const ack = buildHl7Ack(rawMessage, true);
          if (ack) details.write?.(ack);
        }
        return received;
      } catch (error) {
        if (analyzer.protocol === 'HL7' && analyzer.protocol_options?.send_ack !== false) {
          const ack = buildHl7Ack(rawMessage, false, 'Message rejected by LIS');
          if (ack) details.write?.(ack);
        }
        throw error;
      }
    };
    if (NETWORK_TYPES.has(connectionType)) return analyzer.tcp_mode === 'SERVER' ? new TcpServerAdapter({ analyzer, onMessage, onStatus }) : new TcpClientAdapter({ analyzer, onMessage, onStatus });
    if (SERIAL_TYPES.has(connectionType)) return new SerialAdapter({ analyzer, onMessage, onStatus });
    throw new Error(`Unsupported connection type: ${connectionType}`);
  }

  async connect(analyzer) {
    let adapter = this.adapters.get(String(analyzer._id));
    if (!adapter) {
      adapter = this.#create(analyzer);
      this.adapters.set(String(analyzer._id), adapter);
    }
    try {
      return await adapter.connect();
    } catch (error) {
      await adapter.disconnect().catch(() => {});
      this.adapters.delete(String(analyzer._id));
      throw error;
    }
  }

  async disconnect(analyzer) {
    const adapter = this.adapters.get(String(analyzer._id));
    if (adapter) await adapter.disconnect();
    this.adapters.delete(String(analyzer._id));
    await this.AnalyzerConfig.findByIdAndUpdate(analyzer._id, { connection_status: 'DISCONNECTED', updated_at: new Date().toISOString() });
  }

  async testConnection(analyzer) {
    const active = this.adapters.get(String(analyzer._id));
    return (active || this.#create(analyzer)).testConnection();
  }

  async shutdown() {
    await Promise.all([...this.adapters.values()].map((adapter) => adapter.disconnect().catch(() => {})));
    this.adapters.clear();
  }
}
