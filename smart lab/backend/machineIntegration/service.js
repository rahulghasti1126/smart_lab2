import crypto from 'crypto';
import { getProtocolAdapter } from './protocolRegistry.js';
import { PROCESSING_STATUSES } from './statuses.js';
import { validateRawMessage } from './validation.js';

const parseReferenceRange = (range) => {
  const match = String(range || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)\s*$/i);
  return match ? { low: Number(match[1]), high: Number(match[2]) } : null;
};

const validationFlag = ({ value, referenceRange, analyzerFlag }) => {
  const supplied = String(analyzerFlag || '').trim().toUpperCase();
  if (['HH', 'LL', 'CRITICAL', 'CRIT'].includes(supplied)) return 'Critical';
  if (['H', 'HIGH'].includes(supplied)) return 'High';
  if (['L', 'LOW'].includes(supplied)) return 'Low';
  if (['A', 'ABNORMAL', 'POS', 'POSITIVE'].includes(supplied)) return 'Abnormal';
  if (['N', 'NORMAL', 'NEG', 'NEGATIVE'].includes(supplied)) return 'Normal';

  const reference = parseReferenceRange(referenceRange);
  const numericValue = Number(value);
  if (!reference || !Number.isFinite(numericValue)) return 'Pending';
  if (numericValue < reference.low) return 'Low';
  if (numericValue > reference.high) return 'High';
  return 'Normal';
};

const normalizeResults = ({ analyzer, parsed, rawMessage, receivedAt }) => Object.entries(parsed.parameters || {}).map(([testCode, parameter]) => ({
  analyzerId: String(analyzer._id),
  sampleId: String(parsed.sampleId || parsed.barcode || parsed.orderId || '').trim(),
  testCode,
  testName: String(parameter.testName || testCode),
  resultValue: String(parameter.value ?? ''),
  unit: String(parameter.unit || ''),
  referenceRange: String(parameter.referenceRange || ''),
  abnormalFlag: validationFlag({
    value: parameter.value,
    referenceRange: parameter.referenceRange,
    analyzerFlag: parameter.abnormalFlag,
  }),
  analyzerFlag: String(parameter.abnormalFlag || ''),
  timestamp: String(parameter.resultDateTime || receivedAt),
  rawMessage,
}));

const audit = async (AuditLog, data) => {
  try { await AuditLog?.create(data); } catch { /* Never discard an analyzer message because audit storage failed. */ }
};

/**
 * The one analyzer-result pipeline. Communication adapters only forward raw
 * data here; parser choice, normalization, Sample ID matching and persistence
 * are identical for TCP, Wi-Fi, RS-232, USB-serial and the simulator.
 */
export const createMachineIntegrationService = ({ AnalyzerMessage, AnalyzerResult, Sample, Result, Test, AuditLog, emit }) => ({
  async receiveRawMessage({ analyzer, rawMessage, sourceIp, connectionAt, source = 'tcp' }) {
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
      analyzer_ip: sourceIp || analyzer.ip_address || '',
      source,
      connection_at: connectionAt || receivedAt,
      raw_message: rawMessage,
      raw_escaped: JSON.stringify(rawMessage),
      raw_byte_length: Buffer.byteLength(rawMessage, 'utf8'),
      message_hash: messageHash,
      received_at: receivedAt,
      processing_status: PROCESSING_STATUSES.RECEIVED,
    });
    emit?.('machine-raw-message-received', rawRecord);

    try {
      const parsed = getProtocolAdapter(analyzer.protocol).parse(rawMessage);
      const normalizedResults = normalizeResults({ analyzer, parsed, rawMessage, receivedAt });
      if (!normalizedResults.length) {
        const error = new Error('The parsed message contains no normalized results.');
        error.code = 'NO_RESULTS';
        throw error;
      }

      const sampleId = String(parsed.sampleId || parsed.barcode || parsed.orderId || '').trim();
      const sample = sampleId && Sample ? await Sample.findOne({ sample_id: sampleId }) : null;
      const isMatched = Boolean(sample);
      const status = isMatched ? 'VALIDATION_PENDING' : PROCESSING_STATUSES.UNMATCHED;
      const result = await AnalyzerResult.create({
        message_id: rawRecord._id,
        analyzer_id: analyzer._id,
        analyzer_name: analyzer.name,
        patient_id: isMatched ? sample.patient_id : String(parsed.patientId || ''),
        sample_id: sampleId,
        order_id: String(parsed.orderId || ''),
        barcode: String(parsed.barcode || ''),
        parameters: parsed.parameters || {},
        normalized_results: normalizedResults,
        received_at: receivedAt,
        processing_status: status,
        match_status: isMatched ? 'MATCHED' : 'UNMATCHED',
        matched_sample_id: isMatched ? sample.sample_id : '',
      });

      if (isMatched) {
        if (typeof sample.save === 'function') {
          sample.status = 'VALIDATION_PENDING';
          await sample.save();
        } else if (Sample.findByIdAndUpdate) {
          await Sample.findByIdAndUpdate(sample._id, { status: 'VALIDATION_PENDING' });
        }

        for (const normalized of normalizedResults) {
          const assignedTest = Test ? await Test.findOne({
            sample_id: sample.sample_id,
            $or: [{ test_code: normalized.testCode }, { test_name: normalized.testName }],
          }) : null;
          // An unassigned test never becomes final: it requires review.
          const clinicalStatus = assignedTest ? 'VALIDATION_PENDING' : 'UNASSIGNED_TEST';
          if (Result?.findOneAndUpdate) {
            await Result.findOneAndUpdate(
              { sample_id: sample.sample_id, test_code: normalized.testCode },
              {
                $set: {
                  patient_id: sample.patient_id,
                  sample_id: sample.sample_id,
                  test_code: normalized.testCode,
                  test_name: normalized.testName,
                  result_value: normalized.resultValue,
                  unit: normalized.unit,
                  reference_range: normalized.referenceRange,
                  machine_name: analyzer.name,
                  status: clinicalStatus,
                  date: receivedAt,
                  raw_data: JSON.stringify(normalized),
                  analyzer_result_id: result._id,
                },
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
          }
        }
      }

      await AnalyzerMessage.findByIdAndUpdate(rawRecord._id, { processing_status: status });
      await audit(AuditLog, {
        event: isMatched ? 'analyzer_result_matched' : 'analyzer_result_unmatched',
        action: 'RESULT_RECEIVED', entity: 'AnalyzerResult', entity_id: String(result._id),
        subject: sampleId || String(result._id), actor: 'system', role: 'system', timestamp: receivedAt,
        details: `${analyzer.name}: ${normalizedResults.length} result(s), sample ${isMatched ? 'matched' : 'not found'}.`,
      });
      emit?.('machine-result-received', result);
      return { rawRecord, result, normalizedResults, matched: isMatched };
    } catch (error) {
      await AnalyzerMessage.findByIdAndUpdate(rawRecord._id, { processing_status: PROCESSING_STATUSES.ERROR, error: error.message });
      await audit(AuditLog, {
        event: 'machine_message_error', action: 'PARSE_FAILED', entity: 'AnalyzerMessage', entity_id: String(rawRecord._id),
        subject: String(rawRecord._id), actor: 'system', role: 'system', timestamp: receivedAt, details: error.message,
      });
      emit?.('machine-message-error', { messageId: rawRecord._id, error: error.message });
      throw error;
    }
  },
});

export { normalizeResults, validationFlag };
