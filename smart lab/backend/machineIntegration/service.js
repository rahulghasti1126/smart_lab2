import { getProtocolAdapter } from './protocolRegistry.js';
import { PROCESSING_STATUSES } from './statuses.js';
import { validateRawMessage } from './validation.js';
import crypto from 'crypto';

export const createMachineIntegrationService = ({ AnalyzerMessage, AnalyzerResult, AuditLog, emit }) => ({
  async receiveRawMessage({ analyzer, rawMessage, sourceIp, connectionAt, source = 'tcp', captureOnly = false }) {
    const validation = validateRawMessage(rawMessage);
    if (!validation.valid) throw new Error(validation.error);

    const receivedAt = new Date().toISOString();
    const messageHash = crypto.createHash('sha256').update(rawMessage, 'utf8').digest('hex');
    const duplicate = await AnalyzerMessage.findOne({ analyzer_id: analyzer._id, message_hash: messageHash });
    if (duplicate) {
      await AnalyzerMessage.findByIdAndUpdate(duplicate._id, { processing_status: PROCESSING_STATUSES.DUPLICATE });
      return { duplicate: true, rawRecord: duplicate };
    }
    const rawRecord = await AnalyzerMessage.create({
      analyzer_id: analyzer._id,
      analyzer_name: analyzer.name,
      analyzer_ip: sourceIp || analyzer.ip_address,
      source,
      connection_at: connectionAt || receivedAt,
      raw_message: rawMessage,
      raw_escaped: JSON.stringify(rawMessage),
      raw_byte_length: Buffer.byteLength(rawMessage, 'utf8'),
      message_hash: messageHash,
      received_at: receivedAt,
      processing_status: PROCESSING_STATUSES.RECEIVED,
    });

    if (captureOnly) {
      emit?.('machine-raw-message-received', rawRecord);
      return { rawRecord, captureOnly: true };
    }

    try {
      const parsed = getProtocolAdapter(analyzer.protocol).parse(rawMessage);
      const result = await AnalyzerResult.create({
        message_id: rawRecord._id,
        analyzer_id: analyzer._id,
        analyzer_name: analyzer.name,
        sample_id: parsed.sampleId || '',
        order_id: parsed.orderId || '',
        barcode: parsed.barcode || '',
        parameters: parsed.parameters || {},
        received_at: receivedAt,
        processing_status: PROCESSING_STATUSES.UNMATCHED,
      });
      await AnalyzerMessage.findByIdAndUpdate(rawRecord._id, { processing_status: PROCESSING_STATUSES.UNMATCHED });
      await AuditLog?.create({ event: 'machine_result_received', subject: String(result._id), actor: 'system', timestamp: receivedAt, details: analyzer.name });
      emit?.('machine-result-received', result);
      return { rawRecord, result };
    } catch (error) {
      const processingStatus = error.code === 'PROTOCOL_SPECIFICATION_REQUIRED' ? PROCESSING_STATUSES.ERROR : PROCESSING_STATUSES.ERROR;
      await AnalyzerMessage.findByIdAndUpdate(rawRecord._id, { processing_status: processingStatus, error: error.message });
      await AuditLog?.create({ event: 'machine_message_error', subject: String(rawRecord._id), actor: 'system', timestamp: receivedAt, details: error.message });
      throw error;
    }
  },
});
