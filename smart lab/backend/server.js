import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import net from 'net';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/authRoutes.js';
import { connectDB, User, Patient, Sample, Test, Result, AnalyzerConfig, AnalyzerMessage, AnalyzerResult, Reagent, Report, Invoice, LabSettings, AuditLog } from './database.js';
import { parseAnalyzerData } from './analyzerParser.js';
import { getProtocolAdapter } from './machineIntegration/protocolRegistry.js';
import { createMachineIntegrationService } from './machineIntegration/service.js';
import { createSimulatorMessage } from './machineIntegration/simulator.js';
import { validateAnalyzerConfig } from './machineIntegration/validation.js';
import { AnalyzerConnectionManager } from './machineIntegration/communication/connectionManager.js';
import { protect, allowRoles } from './middleware/auth.js';

const app = express();
const defaultAllowedOrigins = ['http://localhost:5173', 'https://smartlab2-frontend.vercel.app'];
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : defaultAllowedOrigins;
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin is not allowed.'));
  },
}));
app.use(express.json({ limit: '6mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

app.get('/api', (req, res) => {
  res.json({ status: 'ok', message: 'Smart Lab API is available' });
});

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth', authRoutes);
// Hardware gateways authenticate with their separately scoped token. All
// browser/API routes after login require a signed JWT.
app.use('/api', (req, res, next) => req.path.startsWith('/machine-integration/gateway/') ? next() : protect(req, res, next));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins },
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token || !process.env.JWT_SECRET) return next(new Error('Authentication is required.'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ id: decoded.id }).select('id role');
    if (!user) return next(new Error('User account not found.'));
    socket.user = user;
    return next();
  } catch {
    return next(new Error('Session is invalid or expired.'));
  }
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

const emitUpdate = (event, payload) => {
  io.emit(event, payload);
};

const machineIntegration = createMachineIntegrationService({ AnalyzerMessage, AnalyzerResult, Sample, Result, Test, AuditLog, emit: emitUpdate });
const gatewayStatuses = new Set(['CONNECTED', 'DATA RECEIVED', 'WAITING_FOR_ANALYZER', 'WAITING FOR ANALYZER', 'DISCONNECTED', 'RECONNECTING', 'ERROR']);
const connectionManager = new AnalyzerConnectionManager({ AnalyzerConfig, AuditLog, machineIntegration, emit: emitUpdate });

const requireMachineGatewayToken = (req, res, next) => {
  const configuredToken = process.env.MACHINE_GATEWAY_TOKEN;
  const authorization = req.get('authorization') || '';
  const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!configuredToken || configuredToken.length < 32) {
    return res.status(503).json({ error: 'Machine gateway is not configured on this server.' });
  }

  const supplied = Buffer.from(suppliedToken);
  const configured = Buffer.from(configuredToken);
  if (supplied.length !== configured.length || !crypto.timingSafeEqual(supplied, configured)) {
    return res.status(401).json({ error: 'Invalid machine gateway credentials.' });
  }

  next();
};

const requireMachineAdmin = allowRoles('admin');

const getAnalyzerOr404 = async (req, res) => {
  const analyzer = await AnalyzerConfig.findById(req.params.id);
  if (!analyzer) {
    res.status(404).json({ error: 'Analyzer not found.' });
    return null;
  }
  return analyzer;
};

app.get('/api/users', allowRoles('admin'), async (req, res) => {
  try {
    res.json(await User.find().select('id username name role created_at').sort({ created_at: -1 }).lean());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/users/:id/role', allowRoles('admin'), async (req, res) => {
  try {
    const role = String(req.body?.role || '');
    if (!['admin', 'pathologist', 'technician'].includes(role)) return res.status(400).json({ error: 'Invalid laboratory role.' });
    if (req.params.id === req.user.id && role !== 'admin') return res.status(409).json({ error: 'You cannot remove your own administrator role.' });
    const user = await User.findOneAndUpdate({ id: req.params.id }, { role }, { new: true }).select('id username name role');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    await logAudit('user_role_changed', user.id, req.user.id, `${user.username} role set to ${role}`, { req, entity: 'User', newValue: { role } });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/machine-integration/analyzers', async (req, res) => {
  try {
    res.json(await AnalyzerConfig.find().sort({ name: 1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/machine-integration/analyzers', requireMachineAdmin, async (req, res) => {
  try {
    const input = { ...req.body, model: req.body?.model || '', tcpMode: req.body?.tcpMode || 'CLIENT' };
    const validation = validateAnalyzerConfig(input);
    if (!validation.valid) return res.status(400).json({ error: validation.errors.join(' ') });
    const analyzer = await AnalyzerConfig.create({
      name: input.name.trim(),
      model: input.model,
      manufacturer: input.manufacturer || '',
      category: input.category || '',
      analyzer_id: input.analyzerId?.trim() || undefined,
      ip_address: input.ipAddress?.trim() || '',
      server_ip: input.serverIp?.trim() || '',
      port: Number(input.port) || undefined,
      connection_type: input.connectionType || 'NETWORK',
      serial_port: input.serialPort || '',
      baud_rate: Number(input.baudRate) || 9600,
      data_bits: Number(input.dataBits) || 8,
      stop_bits: Number(input.stopBits) || 1,
      parity: input.parity || 'none',
      flow_control: input.flowControl || 'none',
      server_port: Number(input.serverPort) || undefined,
      tcp_mode: input.tcpMode,
      protocol: input.protocol,
      protocol_options: input.protocolOptions || {},
      remote_control_supported: Boolean(input.remoteControlSupported),
      auto_connect: Boolean(input.autoConnect),
      auto_receive: input.autoReceive !== false,
      timeout: Number(input.timeout) || 30000,
      reconnect_interval: Number(input.reconnectInterval) || 5000,
      enabled: Boolean(input.enabled),
      updated_at: new Date().toISOString(),
    });
    await logAudit('analyzer_configured', String(analyzer._id), req.user.id, `Configured ${analyzer.name}`);
    res.status(201).json(analyzer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/machine-integration/analyzers/:id', requireMachineAdmin, async (req, res) => {
  try {
    const analyzer = await getAnalyzerOr404(req, res);
    if (!analyzer) return;
    const input = { ...analyzer.toObject(), ...req.body, ipAddress: req.body.ipAddress ?? analyzer.ip_address, serverIp: req.body.serverIp ?? analyzer.server_ip, serialPort: req.body.serialPort ?? analyzer.serial_port, tcpMode: req.body.tcpMode ?? analyzer.tcp_mode, connectionType: req.body.connectionType ?? analyzer.connection_type };
    const validation = validateAnalyzerConfig(input);
    if (!validation.valid) return res.status(400).json({ error: validation.errors.join(' ') });
    Object.assign(analyzer, {
      name: input.name,
      analyzer_id: input.analyzerId ?? input.analyzer_id ?? analyzer.analyzer_id,
      model: input.model ?? analyzer.model,
      manufacturer: input.manufacturer ?? analyzer.manufacturer,
      category: input.category ?? analyzer.category,
      ip_address: input.ipAddress || '',
      server_ip: input.serverIp || '',
      port: Number(input.port) || undefined,
      connection_type: input.connectionType || analyzer.connection_type,
      serial_port: input.serialPort ?? analyzer.serial_port,
      baud_rate: input.baudRate ? Number(input.baudRate) : analyzer.baud_rate,
      data_bits: input.dataBits ? Number(input.dataBits) : analyzer.data_bits,
      stop_bits: input.stopBits ? Number(input.stopBits) : analyzer.stop_bits,
      parity: input.parity ?? analyzer.parity,
      flow_control: input.flowControl ?? analyzer.flow_control,
      server_port: input.serverPort ? Number(input.serverPort) : analyzer.server_port,
      tcp_mode: input.tcpMode,
      protocol: input.protocol,
      protocol_options: input.protocolOptions ?? analyzer.protocol_options,
      remote_control_supported: input.remoteControlSupported ?? analyzer.remote_control_supported,
      auto_connect: input.autoConnect ?? analyzer.auto_connect,
      auto_receive: input.autoReceive ?? analyzer.auto_receive,
      timeout: input.timeout ? Number(input.timeout) : analyzer.timeout,
      reconnect_interval: input.reconnectInterval ? Number(input.reconnectInterval) : analyzer.reconnect_interval,
      enabled: Boolean(input.enabled),
      updated_at: new Date().toISOString(),
    });
    await analyzer.save();
    res.json(analyzer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/machine-integration/analyzers/:id/test-connection', requireMachineAdmin, async (req, res) => {
  try {
    const analyzer = await getAnalyzerOr404(req, res);
    if (!analyzer) return;
    const test = await connectionManager.testConnection(analyzer);
    await logAudit('analyzer_connection_tested', String(analyzer._id), req.user.id, `${analyzer.name}: ${test.status || 'TCP reachable'}`);
    res.json({ connected: Boolean(test.reachable), status: test.status || (test.reachable ? 'TCP_REACHABLE' : 'NOT_CONNECTED'), ...test });
  } catch (err) {
    await AnalyzerConfig.findByIdAndUpdate(req.params.id, { connection_status: 'ERROR', updated_at: new Date().toISOString() });
    res.status(502).json({ error: `Connection test failed: ${err.message}` });
  }
});

app.post('/api/machine-integration/gateway/:id/messages', requireMachineGatewayToken, async (req, res) => {
  try {
    const analyzer = await AnalyzerConfig.findById(req.params.id);
    if (!analyzer) return res.status(404).json({ error: 'Analyzer not found.' });
    if (analyzer.tcp_mode !== 'SERVER') {
      return res.status(409).json({ error: 'Analyzer TCP mode must be SERVER for a local gateway.' });
    }

    const result = await machineIntegration.receiveRawMessage({
      analyzer,
      rawMessage: req.body?.rawMessage,
      sourceIp: req.body?.sourceIp,
      connectionAt: req.body?.connectionAt,
      source: 'local-gateway',
    });
    res.status(result.duplicate ? 200 : 201).json({ received: true, duplicate: Boolean(result.duplicate) });
  } catch (error) {
    const status = ['PROTOCOL_UNAVAILABLE', 'PROTOCOL_SPECIFICATION_REQUIRED'].includes(error.code)
      ? 422
      : error.message === 'Raw message is required.' || error.message === 'Raw message is too large.' ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

app.post('/api/machine-integration/gateway/:id/status', requireMachineGatewayToken, async (req, res) => {
  try {
    const { status, details = {} } = req.body || {};
    if (!gatewayStatuses.has(status)) {
      return res.status(400).json({ error: 'Unsupported machine gateway status.' });
    }

    const analyzer = await AnalyzerConfig.findByIdAndUpdate(
      req.params.id,
      { connection_status: status, updated_at: new Date().toISOString() },
      { new: true }
    );
    if (!analyzer) return res.status(404).json({ error: 'Analyzer not found.' });
    emitUpdate('machine-integration-status', { analyzerId: analyzer._id, status, details });
    res.json({ updated: true, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const dynamicServers = {};
const dynamicClients = {};

app.post('/api/machine-integration/analyzers/:id/connect', requireMachineAdmin, async (req, res) => {
  try {
    const analyzer = await getAnalyzerOr404(req, res);
    if (!analyzer) return;

    const session = await connectionManager.connect(analyzer);
    await logAudit('analyzer_connect_requested', String(analyzer._id), req.user.id, `${analyzer.name}: ${session.status}`);
    return res.json({ ...session, analyzerId: analyzer._id, message: session.status === 'WAITING_FOR_ANALYZER' ? 'LIS listener is active and awaiting the analyzer.' : 'Analyzer connection established.' });

    if (analyzer.tcp_mode === 'SERVER') {
      if (dynamicServers[analyzer._id]) {
        return res.json({ status: 'WAITING FOR ANALYZER', message: 'Already listening', analyzerId: analyzer._id });
      }

      const server = net.createServer((socket) => {
        const remoteIp = socket.remoteAddress;
        console.log(`Analyzer connected from ${remoteIp}`);

        socket.on('data', async (chunk) => {
          const rawData = chunk.toString('utf8');
          console.log(`Raw data from ${analyzer.name}:`, rawData);
          emitUpdate('raw-analyzer-data', { raw: rawData });

          handleAnalyzerData(rawData);

          try {
            await machineIntegration.receiveRawMessage({ analyzer, rawMessage: rawData, sourceIp: remoteIp, connectionAt: new Date().toISOString() });
          } catch (error) {
            console.error(`Message storage error: ${error.message}`);
          }
        });

        socket.on('error', (err) => console.error(`Socket error: ${err.message}`));
        socket.on('close', () => console.log(`Analyzer disconnected`));
      });

      server.on('error', (err) => {
        console.error(`Server error: ${err.message}`);
        AnalyzerConfig.findByIdAndUpdate(analyzer._id, { connection_status: 'ERROR', updated_at: new Date().toISOString() }).exec();
      });

      server.listen(analyzer.port, '0.0.0.0', async () => {
        console.log(`Listening on 0.0.0.0:${analyzer.port} for ${analyzer.name}`);
        dynamicServers[analyzer._id] = server;
        await AnalyzerConfig.findByIdAndUpdate(analyzer._id, { connection_status: 'WAITING FOR ANALYZER', updated_at: new Date().toISOString() });
      });

      res.json({ status: 'STARTING', message: `Listening on 0.0.0.0:${analyzer.port}`, analyzerId: analyzer._id });
    } else {
      if (dynamicClients[analyzer._id]) {
        return res.json({ status: 'CONNECTED', message: 'Already connected', analyzerId: analyzer._id });
      }

      const client = new net.Socket();
      client.connect(analyzer.port, analyzer.ip_address, async () => {
        console.log(`Connected to ${analyzer.name} at ${analyzer.ip_address}:${analyzer.port}`);
        dynamicClients[analyzer._id] = client;
        await AnalyzerConfig.findByIdAndUpdate(analyzer._id, { connection_status: 'CONNECTED', updated_at: new Date().toISOString() });
        emitUpdate('machine-connected', { path: `TCP://${analyzer.ip_address}:${analyzer.port}` });
        res.json({ status: 'CONNECTED', message: `Connected to ${analyzer.ip_address}:${analyzer.port}`, analyzerId: analyzer._id });
      });

      let buffer = '';
      client.on('data', async (chunk) => {
        const str = chunk.toString('utf8');
        emitUpdate('raw-analyzer-data', { raw: str });
        buffer += str;
        let lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) {
          if (line.trim()) {
            handleAnalyzerData(line);
          }
        }

        try {
          await machineIntegration.receiveRawMessage({ analyzer, rawMessage: str, sourceIp: analyzer.ip_address, connectionAt: new Date().toISOString() });
        } catch (error) {
          console.error(`Message storage error: ${error.message}`);
        }
      });

      client.on('error', async (err) => {
        console.error(`Client error for ${analyzer.name}: ${err.message}`);
        emitUpdate('machine-error', { error: err.message });
        await AnalyzerConfig.findByIdAndUpdate(analyzer._id, { connection_status: 'ERROR', updated_at: new Date().toISOString() });
        delete dynamicClients[analyzer._id];
        if (!res.headersSent) res.status(500).json({ success: false, message: 'Connection failed', status: 'ERROR', error: err.message });
      });

      client.on('close', async () => {
        console.log(`Connection closed for ${analyzer.name}`);
        emitUpdate('machine-disconnected', { path: `TCP://${analyzer.ip_address}:${analyzer.port}` });
        await AnalyzerConfig.findByIdAndUpdate(analyzer._id, { connection_status: 'STOPPED', updated_at: new Date().toISOString() });
        delete dynamicClients[analyzer._id];
      });
    }
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.post('/api/machine-integration/analyzers/:id/disconnect', requireMachineAdmin, async (req, res) => {
  try {
    const analyzer = await getAnalyzerOr404(req, res);
    if (!analyzer) return;

    await connectionManager.disconnect(analyzer);
    await logAudit('analyzer_disconnected', String(analyzer._id), req.user.id, `Disconnected ${analyzer.name}`);
    return res.json({ success: true, status: 'DISCONNECTED', message: 'Connection stopped.' });

    if (analyzer.tcp_mode === 'SERVER') {
      const server = dynamicServers[analyzer._id];
      if (server) {
        server.close();
        delete dynamicServers[analyzer._id];
      }
    } else {
      const client = dynamicClients[analyzer._id];
      if (client) {
        client.destroy();
        delete dynamicClients[analyzer._id];
      }
    }

    await AnalyzerConfig.findByIdAndUpdate(req.params.id, { connection_status: 'STOPPED', updated_at: new Date().toISOString() });
    res.json({ success: true, status: 'STOPPED', message: 'Connection stopped.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/machine-integration/analyzers/:id/simulate', requireMachineAdmin, async (req, res) => {
  try {
    const analyzer = await getAnalyzerOr404(req, res);
    if (!analyzer) return;
    const rawMessage = req.body?.rawMessage || createSimulatorMessage({ ...req.body, protocol: analyzer.protocol });
    // The simulator deliberately enters the same production pipeline as a
    // physical adapter; it is visibly recorded as source=simulator.
    const result = await machineIntegration.receiveRawMessage({ analyzer, rawMessage, sourceIp: 'simulator', source: 'simulator' });
    await logAudit('analyzer_simulation_received', String(analyzer._id), req.user.id, `Simulator ran through ${analyzer.protocol} pipeline.`);
    res.status(201).json(result);
  } catch (err) {
    res.status(['PROTOCOL_UNAVAILABLE', 'PROTOCOL_SPECIFICATION_REQUIRED'].includes(err.code) ? 422 : 500).json({ error: err.message, code: err.code });
  }
});

app.get('/api/machine-integration/messages', async (req, res) => {
  try {
    res.json(await AnalyzerMessage.find().sort({ received_at: -1 }).limit(200).lean());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/machine-integration/results', async (req, res) => {
  try {
    res.json(await AnalyzerResult.find().sort({ received_at: -1 }).limit(200).lean());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/machine-integration/unmatched-results', allowRoles('admin', 'technician', 'pathologist'), async (req, res) => {
  try {
    const results = await AnalyzerResult.find({ $or: [{ processing_status: 'UNMATCHED' }, { match_status: 'UNMATCHED' }] })
      .sort({ received_at: -1 }).limit(200).lean();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/machine-integration/unmatched-results/:id/resolve', allowRoles('admin', 'technician'), async (req, res) => {
  try {
    const sampleId = String(req.body?.sampleId || '').trim();
    const reason = String(req.body?.reason || '').trim();
    if (!sampleId || !reason) return res.status(400).json({ error: 'Sample ID and resolution reason are required.' });
    const [analyzerResult, sample] = await Promise.all([
      AnalyzerResult.findById(req.params.id),
      Sample.findOne({ sample_id: sampleId }),
    ]);
    if (!analyzerResult) return res.status(404).json({ error: 'Analyzer result not found.' });
    if (!sample) return res.status(404).json({ error: 'The selected Sample ID does not exist.' });
    if (analyzerResult.processing_status !== 'UNMATCHED') return res.status(409).json({ error: 'This result has already been resolved or requires a different workflow.' });

    const normalized = analyzerResult.normalized_results || [];
    if (!normalized.length) return res.status(409).json({ error: 'This legacy result has no normalized parameters and cannot be safely resolved automatically.' });
    for (const parameter of normalized) {
      await Result.findOneAndUpdate(
        { sample_id: sample.sample_id, test_code: parameter.testCode },
        { $set: {
          patient_id: sample.patient_id, sample_id: sample.sample_id, test_code: parameter.testCode,
          test_name: parameter.testName, result_value: parameter.resultValue, unit: parameter.unit,
          reference_range: parameter.referenceRange, machine_name: analyzerResult.analyzer_name,
          status: 'VALIDATION_PENDING', date: new Date().toISOString(), raw_data: JSON.stringify(parameter), analyzer_result_id: analyzerResult._id,
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    const oldValue = analyzerResult.toObject();
    analyzerResult.patient_id = sample.patient_id;
    analyzerResult.sample_id = sample.sample_id;
    analyzerResult.processing_status = 'VALIDATION_PENDING';
    analyzerResult.match_status = 'MANUALLY_RESOLVED';
    analyzerResult.matched_sample_id = sample.sample_id;
    analyzerResult.review_reason = reason;
    await Promise.all([analyzerResult.save(), Sample.findByIdAndUpdate(sample._id, { status: 'VALIDATION_PENDING' })]);
    await logAudit('unmatched_result_resolved', String(analyzerResult._id), req.user.id, `Manually matched to ${sample.sample_id}: ${reason}`, { req, entity: 'AnalyzerResult', oldValue, newValue: analyzerResult.toObject() });
    res.json(analyzerResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/patients/:id/machine-results', async (req, res) => {
  try {
    const patientId = req.params.id.trim();
    if (!patientId) return res.status(400).json({ error: 'Patient ID is required.' });

    const escapedPatientId = patientId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactIdentifier = new RegExp(`^${escapedPatientId}$`, 'i');
    const rawMessageMatch = new RegExp(escapedPatientId, 'i');
    const [storedResults, messages] = await Promise.all([
      AnalyzerResult.find({
        $or: [
          { patient_id: exactIdentifier },
          { sample_id: exactIdentifier },
          { barcode: exactIdentifier },
          { order_id: exactIdentifier },
        ],
      }).sort({ received_at: -1 }).limit(200).lean(),
      AnalyzerMessage.find({ raw_message: rawMessageMatch })
        .populate('analyzer_id', 'protocol name')
        .sort({ received_at: -1 })
        .limit(200)
        .lean(),
    ]);

    const savedResults = storedResults.map((result) => ({
      ...result,
      parameters: result.reviewed_parameters || result.parameters || {},
    }));

    const resultsByMessage = new Map(savedResults.map((result) => [String(result.message_id), result]));
    const matchingResults = [...savedResults];

    for (const message of messages) {
      const analyzer = message.analyzer_id;
      if (!analyzer?.protocol) continue;

      try {
        const parsed = getProtocolAdapter(analyzer.protocol).parse(message.raw_message);
        const identifiers = [parsed.patientId, parsed.sampleId, parsed.barcode, parsed.orderId]
          .filter(Boolean)
          .map((value) => String(value).trim().toLowerCase());
        if (!identifiers.includes(patientId.toLowerCase())) continue;

        const existingResult = resultsByMessage.get(String(message._id));
        matchingResults.push({
          ...(existingResult || {}),
          _id: existingResult?._id || message._id,
          message_id: message._id,
          analyzer_name: existingResult?.analyzer_name || message.analyzer_name || analyzer.name,
          patient_id: existingResult?.patient_id || parsed.patientId || '',
          sample_id: existingResult?.sample_id || parsed.sampleId || '',
          order_id: existingResult?.order_id || parsed.orderId || '',
          barcode: existingResult?.barcode || parsed.barcode || '',
          parameters: existingResult?.parameters || parsed.parameters || {},
          received_at: existingResult?.received_at || message.received_at,
          processing_status: existingResult?.processing_status || 'UNMATCHED',
        });
      } catch (error) {
        console.error(`Could not parse historical analyzer message ${message._id}: ${error.message}`);
        if (message.raw_message.toLowerCase().includes(patientId.toLowerCase())) {
          matchingResults.push({
            _id: message._id,
            message_id: message._id,
            analyzer_name: message.analyzer_name || analyzer.name,
            received_at: message.received_at,
            processing_status: 'ERROR',
            parse_error: error.message,
            raw_message: message.raw_message,
            parameters: {},
          });
        }
      }
    }

    const uniqueResults = [...new Map(matchingResults.map((result) => [String(result.message_id || result._id), result])).values()]
      .sort((a, b) => new Date(b.received_at || 0) - new Date(a.received_at || 0));
    res.json(uniqueResults);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let activePort = null;
let parser = null;
let tcpBuffer = '';
let pendingMachineCommand = null;
let pendingMachineTimer = null;

const logAudit = async (event, subject, actor, details, { req, entity = '', oldValue, newValue } = {}) => {
  try {
    if (AuditLog && typeof AuditLog.create === 'function') {
      await AuditLog.create({
        event,
        subject,
        actor,
        timestamp: new Date().toISOString(),
        details: details || '',
        action: event,
        entity,
        entity_id: subject,
        role: req?.user?.role || '',
        ip_address: req?.ip || '',
        old_value: oldValue,
        new_value: newValue,
      });
    }
  } catch (err) {
    console.error('Audit log failed:', err?.message || err);
  }
};

const clearPendingMachineTimer = () => {
  if (pendingMachineTimer) {
    clearTimeout(pendingMachineTimer);
    pendingMachineTimer = null;
  }
};



app.get('/api/ports', async (req, res) => {
  try {
    const ports = await SerialPort.list();
    res.json(ports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/connect', async (req, res) => {
  return res.status(410).json({ error: 'Direct legacy connections are disabled. Create an analyzer configuration so data uses the audited integration pipeline.' });
  let { path, baudRate = 9600, delimiter = '\r\n' } = req.body;
  
  // Unescape the literal strings sent from the frontend
  if (delimiter === '\\n') delimiter = '\n';
  else if (delimiter === '\\r\\n') delimiter = '\r\n';
  else if (delimiter === '\\r') delimiter = '\r';

  if (!path) {
    return res.status(400).json({ error: 'Serial port path is required.' });
  }

  // If already connected to the same path, keep it open until user requests disconnect
  try {
    if (activePort && activePort.isOpen) {
      const currentPath = activePort.path || (activePort.settings && activePort.settings.path) || null;
      if (currentPath === path) {
        return res.json({ message: `Already connected to ${path}`, status: 'Waiting' });
      }
      // closing different active port before opening new one
      activePort.close();
      activePort = null;
      parser = null;
    }
  } catch (e) {
    console.error('Error while handling existing port:', e?.message || e);
  }

  try {
    activePort = new SerialPort({ path, baudRate, autoOpen: false });
    activePort.machineResponding = false;
    // allow configurable delimiter (default LF) to handle different device line endings
    parser = activePort.pipe(new ReadlineParser({ delimiter }));

    // Emit raw chunks (like HyperTerminal) for visibility and debugging
    activePort.on('data', (chunk) => {
      try {
        if (activePort?.isSerial && !activePort.machineResponding) {
          activePort.machineResponding = true;
          emitUpdate('machine-connected', { path, status: 'Connected' });
        }
        const s = `${chunk}`;
        console.log('Raw chunk from port:', s);
        emitUpdate('raw-analyzer-data', { raw: s });
      } catch (e) {
        console.error('Error reading raw chunk:', e?.message || e);
      }
    });

    parser.on('data', (data) => {
      console.log('Raw Data from Machine (line):', data);
      handleAnalyzerData(data);
    });

    activePort.on('error', (err) => {
      console.error('Serial Error:', err.message);
      emitUpdate('machine-error', { error: err.message });
    });

    activePort.open((openErr) => {
      if (openErr) {
        return res.status(500).json({ error: openErr.message });
      }
      activePort.isSerial = true;
      console.log(`Connected to machine on ${path}`);
      emitUpdate('machine-connected', { path, status: 'Connected' });
      res.json({ message: `Port ${path} opened successfully.`, status: 'Connected', portOpen: true, connected: true });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/connect-network', async (req, res) => {
  return res.status(410).json({ error: 'Direct legacy connections are disabled. Configure the analyzer and use its Connect action.' });
  const { host, port } = req.body;
  if (!host || !port) {
    return res.status(400).json({ error: 'Host and port are required for network connection.' });
  }

  try {
    if (activePort) {
      if (activePort.isNetwork && activePort.remoteAddress === host && activePort.remotePort === Number(port)) {
        return res.json({ message: `Already connected to ${host}:${port}` });
      }
      if (activePort.isSerial) activePort.close();
      else if (activePort.isNetwork) activePort.destroy();

      activePort = null;
      parser = null;
      tcpBuffer = '';
    }
  } catch (e) {
    console.error('Error closing existing connection:', e);
  }

  try {
    activePort = new net.Socket();
    activePort.isNetwork = true;
    activePort.path = `TCP://${host}:${port}`;

    activePort.connect(Number(port), host, () => {
      console.log(`Connected to machine via Network at ${host}:${port}`);
      emitUpdate('machine-connected', { path: activePort.path });
      res.json({ message: `Connected to ${activePort.path}` });
    });

    activePort.on('data', (data) => {
      const chunk = data.toString('utf-8');
      console.log('Raw chunk from network:', chunk);
      emitUpdate('raw-analyzer-data', { raw: chunk });

      tcpBuffer += chunk;
      let lines = tcpBuffer.split(/\r?\n/);
      tcpBuffer = lines.pop(); // keep the last incomplete part in the buffer

      for (const line of lines) {
        if (line.trim()) {
          console.log('Raw Data from Network Machine (line):', line);
          handleAnalyzerData(line);
        }
      }
    });

    activePort.on('error', (err) => {
      console.error('Network Error:', err.message);
      emitUpdate('machine-error', { error: err.message });
    });

    activePort.on('close', () => {
      console.log('Network connection closed');
      emitUpdate('machine-disconnected', { path: activePort?.path || null });
      if (activePort && activePort.isNetwork) {
        activePort = null;
        tcpBuffer = '';
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug: parse raw analyzer line without saving
app.post('/api/debug/parse', (req, res) => {
  try {
    const { raw } = req.body || {};
    if (!raw) return res.status(400).json({ error: 'raw field is required in body' });
    const parsed = parseAnalyzerData(raw);
    return res.json({ raw, parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/disconnect', async (req, res) => {
  return res.status(410).json({ error: 'Direct legacy connections are disabled. Disconnect the configured analyzer instead.' });
  try {
    if (activePort) {
      const p = activePort;
      const path = p.path || (p.settings && p.settings.path) || null;
      if (p.isSerial && p.isOpen) {
        p.close((err) => {
          if (err) console.error('Error closing serial port:', err.message || err);
        });
      } else if (p.isNetwork) {
        p.destroy();
      }

      emitUpdate('machine-disconnected', { path });
      activePort = null;
      parser = null;
      tcpBuffer = '';
      return res.json({ message: 'Disconnected' });
    }
    return res.json({ message: 'No active connection' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const sendMachineCommand = async (req, res, action) => {
  return res.status(501).json({ error: 'Remote Start/Stop is not supported until this analyzer has documented, validated remote-control commands configured.' });
  try {
    const { patientName, patientId, machine, testType } = req.body || {};
    const command = req.body?.command || (action === 'start' ? 'START\r\n' : 'STOP\r\n');

    clearPendingMachineTimer();
    pendingMachineCommand = { action, patientName, patientId, machine, testType };

    if (!activePort || !activePort.isOpen) {
      pendingMachineCommand = null;
      return res.status(400).json({ error: 'Machine is not connected. Connect to a valid COM port first to receive real data.' });
    }

    activePort.write(command, (err) => {
      if (err) {
        console.error('Failed to send command to port:', err);
        emitUpdate('machine-error', { error: 'Failed to send command: ' + err.message });
      }
    });
    emitUpdate('machine-command', { action, command });

    return res.json({ message: `${action === 'start' ? 'Start' : 'Stop'} command sent to analyzer.` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

app.post('/api/machine/start', async (req, res) => {
  return sendMachineCommand(req, res, 'start');
});

app.post('/api/machine/stop', async (req, res) => {
  return sendMachineCommand(req, res, 'stop');
});

app.get('/api/port/status', (req, res) => {
  try {
    let isConnected = false;
    let pathName = null;

    if (activePort) {
      if (activePort.isSerial && activePort.isOpen) {
        isConnected = true;
        pathName = activePort.path || (activePort.settings && activePort.settings.path);
      } else if (activePort.isNetwork && !activePort.destroyed) {
        isConnected = true;
        pathName = activePort.path;
      }
    }

    const status = activePort?.isSerial && isConnected
      ? (activePort.machineResponding ? 'Connected' : 'Waiting')
      : (isConnected ? 'Connected' : 'Disconnected');
    res.json({ connected: status === 'Connected', portOpen: isConnected, status, path: pathName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const handleAnalyzerData = async (data) => {
  if (!data) return;
  clearPendingMachineTimer();
  pendingMachineCommand = null;
  
  const rawString = `${data}`;
  console.log('Handling raw analyzer data:', rawString);
  
  // Emit the raw data for UI logging
  emitUpdate('raw-analyzer-data', { raw: rawString });
  
  // First Objective: Do not mock results. Wait for real parser.
  emitUpdate('machine-unparsed-data', {
    raw: rawString,
    message: '⚠ Raw analyzer data received\n⚠ Parser could not identify the result fields'
  });
  
  // Real patient matching and Result.create will happen when parser is implemented.
};

app.post('/api/patients/add', async (req, res) => {
  try {
    const p = req.body || {};
    if (!String(p.patientName || '').trim()) return res.status(400).json({ error: 'Patient name is required.' });
    if (p.age !== undefined && (!Number.isInteger(Number(p.age)) || Number(p.age) < 0 || Number(p.age) > 130)) return res.status(400).json({ error: 'Age must be between 0 and 130.' });
    const patientId = `P${Date.now()}`;
    const patient = await Patient.create({
      id: patientId,
      name: p.patientName,
      age: p.age,
      gender: p.gender,
      phone: p.phone,
      email: p.email,
      doctor: p.doctor,
      dob: p.dob || '',
      address: p.address || '',
      date: new Date().toISOString(),
      status: 'pending',
    });

    await logAudit('patient_registered', patientId, req.user.id, `Patient ${p.patientName} registered`, { req, entity: 'Patient' });
    res.status(201).json({ id: patientId, patient: patient.toObject(), message: 'Patient registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patients/:id/tests', async (req, res) => {
  try {
    const { id } = req.params;
    const { testName, testCode = '', machineName = '', analyzerId } = req.body || {};
    if (!String(testName || '').trim()) return res.status(400).json({ error: 'Test name is required.' });
    const patient = await Patient.findOne({ id });
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });
    if (analyzerId && !await AnalyzerConfig.findById(analyzerId)) return res.status(404).json({ error: 'Assigned analyzer not found.' });

    // Generate unique sample ID: LAB-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let sampleId;
    let sample;
    for (let retry = 0; retry < 4 && !sample; retry += 1) {
      const sampleCount = await Sample.countDocuments({ sample_id: new RegExp(`^LAB-${dateStr}-`) });
      sampleId = `LAB-${dateStr}-${String(sampleCount + 1 + retry).padStart(4, '0')}`;
      try {
        sample = await Sample.create({
          sample_id: sampleId, patient_id: id, status: 'REGISTERED', collection_date: new Date().toISOString(),
          analyzer_id: analyzerId || undefined, tests: [String(testCode || testName)],
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    if (!sample) throw new Error('Could not allocate a unique Sample ID. Please retry.');

    const result = await Result.create({
      patient_id: id,
      sample_id: sampleId,
      test_name: testName,
      test_code: testCode,
      machine_name: machineName,
      status: 'Pending',
      date: new Date().toISOString(),
    });

    await Test.create({
      test_id: `T${Date.now()}`,
      sample_id: sampleId,
      patient_id: id,
      test_name: testName,
      test_code: testCode,
      analyzer_id: analyzerId || undefined,
      status: 'ASSIGNED',
      assigned_date: new Date().toISOString()
    });

    await logAudit('sample_created', sampleId, req.user.id, `Sample assigned: ${testName}`, { req, entity: 'Sample', newValue: sample.toObject() });
    res.status(201).json({ message: 'Test and Sample added successfully', result, sampleId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/patients/all', async (req, res) => {
  try {
    const patients = await Patient.find().sort({ date: -1 });
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/patients/dashboard', async (req, res) => {
  try {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const [todayPatients, pendingTests, completedTests, revenueResult] = await Promise.all([
      Patient.countDocuments({ date: { $gte: todayMidnight.toISOString() } }),
      Patient.countDocuments({ status: 'pending' }),
      Patient.countDocuments({ status: 'completed' }),
      Invoice.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    const revenue = (revenueResult[0]?.total || 0).toFixed(2);
    res.json({
      todayPatients,
      pendingTests,
      completedTests,
      revenue: `₹${revenue}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const [todayPatients, pendingTests, completedTests, revenueResult] = await Promise.all([
      Patient.countDocuments({ date: { $gte: todayMidnight.toISOString() } }),
      Patient.countDocuments({ status: 'pending' }),
      Patient.countDocuments({ status: 'completed' }),
      Invoice.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    const revenue = (revenueResult[0]?.total || 0).toFixed(2);
    res.json({
      todayPatients,
      pendingTests,
      completedTests,
      revenue: `₹${revenue}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayIso = dayStart.toISOString();
    const [patients, samples, pendingResults, pendingReviews, approvedReports, analyzers, lowStock, revenueRows] = await Promise.all([
      Patient.countDocuments(),
      Sample.countDocuments({ collection_date: { $gte: dayIso } }),
      Result.countDocuments({ status: { $in: ['VALIDATION_PENDING', 'UNASSIGNED_TEST', 'Pending'] } }),
      Report.countDocuments({ status: { $in: ['DRAFT', 'REVISED'] } }),
      Report.countDocuments({ status: 'APPROVED' }),
      AnalyzerConfig.find({}, { name: 1, connection_status: 1, category: 1, updated_at: 1 }).lean(),
      Reagent.find({ $expr: { $lte: ['$stock', '$threshold'] } }, { name: 1, stock: 1, threshold: 1, expiry: 1 }).lean(),
      Invoice.aggregate([{ $match: { date: { $gte: dayIso } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    const connected = analyzers.filter((analyzer) => ['CONNECTED', 'DATA RECEIVED'].includes(analyzer.connection_status)).length;
    res.json({
      totalPatients: patients, todaySamples: samples, pendingResults, pendingPathologistReviews: pendingReviews,
      approvedReports, connectedAnalyzers: connected, disconnectedAnalyzers: analyzers.length - connected,
      lowStockReagents: lowStock.length, todayRevenue: revenueRows[0]?.total || 0, analyzers, lowStock,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/results/add', allowRoles('admin', 'technician', 'pathologist'), async (req, res) => {
  try {
    const { patientId, testName, resultValue, unit, referenceRange, machineName, status } = req.body;
    const now = new Date().toISOString();
    const result = await Result.create({
      patient_id: patientId,
      test_name: testName,
      result_value: resultValue,
      unit: unit || '',
      reference_range: referenceRange || '',
      machine_name: machineName || '',
      status: status || 'VALIDATION_PENDING',
      date: now,
      raw_data: 'manual-entry',
    });

    await logAudit('result_added', patientId, req.user.id, `${testName} result recorded`, { req, entity: 'Result' });
    emitUpdate('result-created', result);
    res.json({ id: result._id, message: 'Result recorded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/results/update', allowRoles('admin', 'technician', 'pathologist'), async (req, res) => {
  try {
    const { id, resultValue, unit, referenceRange, status } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Result id is required' });
    }

    const updateFields = {};
    if (resultValue !== undefined) updateFields.result_value = resultValue;
    if (unit !== undefined) updateFields.unit = unit;
    if (referenceRange !== undefined) updateFields.reference_range = referenceRange;
    if (status !== undefined) updateFields.status = status;

    const oldResult = await Result.findById(id);
    if (oldResult?.status === 'APPROVED') return res.status(409).json({ error: 'An approved result cannot be overwritten. Create a report revision instead.' });
    const result = await Result.findByIdAndUpdate(id, updateFields, { new: true });
    if (!result) {
      return res.status(404).json({ error: 'Result not found' });
    }

    await logAudit('result_updated', id, req.user.id, 'Result value updated manually', { req, entity: 'Result', oldValue: oldResult?.toObject(), newValue: result.toObject() });
    emitUpdate('result-created', result);
    const resultObject = result.toObject();
    res.json({ ...resultObject, id: resultObject._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/recent-tests', async (req, res) => {
  try {
    const rows = await Patient.find().sort({ date: -1 }).limit(10);
    const mapped = rows.map((row) => ({
      id: row.id,
      patient: row.name,
      test: row.test_type,
      time: new Date(row.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: row.status || 'pending',
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/results', async (req, res) => {
  try {
    const rows = await Result.aggregate([
      { $sort: { date: -1 } },
      {
        $lookup: {
          from: 'patients',
          localField: 'patient_id',
          foreignField: 'id',
          as: 'patient',
        },
      },
      { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: '$_id',
          patient_id: 1,
          test_name: 1,
          result_value: 1,
          unit: 1,
          reference_range: 1,
          machine_name: 1,
          status: 1,
          date: 1,
          raw_data: 1,
          patient_name: '$patient.name',
          phone: '$patient.phone',
          email: '$patient.email',
        },
      },
    ]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reagents', async (req, res) => {
  try {
    const reagents = await Reagent.find().sort({ stock: 1 });
    res.json(reagents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reagents', allowRoles('admin'), async (req, res) => {
  try {
    const input = req.body || {};
    if (!String(input.name || '').trim() || !Number.isFinite(Number(input.stock))) return res.status(400).json({ error: 'Reagent name and numeric stock are required.' });
    if (input.analyzerId && !await AnalyzerConfig.findById(input.analyzerId)) return res.status(404).json({ error: 'Mapped analyzer not found.' });
    const reagent = await Reagent.create({
      name: input.name.trim(), manufacturer: input.manufacturer || '', lot_number: input.lotNumber || '',
      stock: Number(input.stock), unit: input.unit || '', expiry: input.expiry || '', threshold: Number(input.minimumStock ?? input.threshold) || 0,
      machine: input.machine || '', analyzer_id: input.analyzerId || undefined, storage_location: input.storageLocation || '', status: input.status || 'ACTIVE',
    });
    await logAudit('reagent_created', String(reagent._id), req.user.id, `Created ${reagent.name}`, { req, entity: 'Reagent', newValue: reagent.toObject() });
    res.status(201).json(reagent);
  } catch (error) {
    res.status(error?.code === 11000 ? 409 : 500).json({ error: error?.code === 11000 ? 'A reagent with this name already exists.' : error.message });
  }
});

app.post('/api/reagents/update', allowRoles('admin'), async (req, res) => {
  try {
    const { id, stock, reason = '' } = req.body;
    if (!id || !Number.isFinite(Number(stock))) return res.status(400).json({ error: 'Reagent ID and numeric stock are required.' });
    const before = await Reagent.findById(id);
    if (!before) return res.status(404).json({ error: 'Reagent not found.' });
    const usage = { at: new Date().toISOString(), user_id: req.user.id, previous_stock: before.stock, new_stock: Number(stock), reason: String(reason) };
    const reagent = await Reagent.findByIdAndUpdate(id, { stock: Number(stock), $push: { usage_history: usage } }, { new: true });
    await logAudit('reagent_stock_updated', id, req.user.id, `${before.name}: ${before.stock} → ${stock}`, { req, entity: 'Reagent', oldValue: before.toObject(), newValue: reagent.toObject() });
    res.json({ reagent, lowStock: reagent.stock <= reagent.threshold, message: 'Reagent stock updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const rows = await Report.aggregate([
      { $sort: { generated_at: -1 } },
      {
        $lookup: {
          from: 'patients',
          localField: 'patient_id',
          foreignField: 'id',
          as: 'patient',
        },
      },
      { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: 1,
          patient_id: 1,
          report_type: 1,
          status: 1,
          generated_at: 1,
          verified_at: 1,
          distributed_at: 1,
          findings: 1,
          doctor_notes: 1,
          machine_parameters: 1,
          patient_name: '$patient.name',
          patient_phone: '$patient.phone',
        },
      },
    ]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/billing/summary', async (req, res) => {
  try {
    const invoices = await Invoice.find({}, { amount: 1, date: 1 }).lean();
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const monthKey = todayKey.slice(0, 7);
    const summary = invoices.reduce((totals, invoice) => {
      const dateKey = new Date(invoice.date).toISOString();
      const amount = Number(invoice.amount) || 0;
      totals.all += amount;
      if (dateKey.slice(0, 10) === todayKey) totals.today += amount;
      if (dateKey.slice(0, 7) === monthKey) totals.month += amount;
      totals.daily[dateKey.slice(0, 10)] = (totals.daily[dateKey.slice(0, 10)] || 0) + amount;
      totals.monthly[dateKey.slice(0, 7)] = (totals.monthly[dateKey.slice(0, 7)] || 0) + amount;
      return totals;
    }, { today: 0, month: 0, all: 0, daily: {}, monthly: {} });
    summary.daily = Object.entries(summary.daily)
      .sort(([first], [second]) => second.localeCompare(first))
      .map(([date, total]) => ({ date, total }));
    summary.monthly = Object.entries(summary.monthly)
      .sort(([first], [second]) => second.localeCompare(first))
      .map(([month, total]) => ({ month, total }));
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/billing/payment-qr', async (req, res) => {
  try {
    const settings = await LabSettings.findOne({ key: 'billing' }).lean();
    res.json({ paymentQr: settings?.payment_qr || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/billing/payment-qr', allowRoles('admin'), async (req, res) => {
  try {
    const { paymentQr } = req.body || {};
    if (!paymentQr || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(paymentQr)) {
      return res.status(400).json({ error: 'Please upload a PNG, JPG or WEBP QR image.' });
    }
    if (paymentQr.length > 4 * 1024 * 1024) {
      return res.status(400).json({ error: 'QR image must be smaller than 4 MB.' });
    }
    await LabSettings.findOneAndUpdate(
      { key: 'billing' },
      { key: 'billing', payment_qr: paymentQr },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ paymentQr, message: 'Payment QR saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const drawReportPdf = (document, { report, patient, results }) => {
  document.fontSize(20).fillColor('#123c69').text(process.env.LAB_NAME || 'Smart Lab Diagnostic Centre');
  document.fontSize(9).fillColor('#444').text(process.env.LAB_ADDRESS || 'Laboratory information system report');
  document.moveDown();
  document.fontSize(14).fillColor('#111').text(`Laboratory report · ${report.id}`);
  document.fontSize(10).text(`Status: ${report.status}    Revision: ${report.revision || 1}`);
  document.moveDown(0.6);
  document.fontSize(11).text(`Patient: ${patient?.name || 'Unknown'} (${report.patient_id})`);
  document.text(`Age / Sex: ${patient?.age ?? '-'} / ${patient?.gender || '-'}`);
  document.text(`Referring doctor: ${patient?.doctor || '-'}`);
  document.text(`Generated: ${report.generated_at ? new Date(report.generated_at).toLocaleString() : '-'}`);
  document.moveDown();
  document.fontSize(11).fillColor('#123c69').text('Results');
  document.moveDown(0.3);
  document.fontSize(8).fillColor('#111');
  const rows = results.length ? results : (report.machine_parameters || []).filter((row) => !row.isSubheading).map((row) => ({
    test_name: row.name, result_value: row.value, unit: row.unit, reference_range: row.range, status: row.status,
  }));
  for (const row of rows) {
    document.text(`${row.test_name || row.test_code || 'Test'}     ${row.result_value ?? '-'} ${row.unit || ''}     Ref: ${row.reference_range || '-'}     ${row.status || ''}`);
  }
  document.moveDown();
  if (report.findings) document.text(`Findings: ${report.findings}`);
  if (report.doctor_notes) document.text(`Comments: ${report.doctor_notes}`);
  document.moveDown();
  if (report.approval?.pathologist_name) {
    document.fillColor('#123c69').text(`Approved by: ${report.approval.pathologist_name}`);
    document.fillColor('#111').text(`Approval recorded: ${new Date(report.approval.signed_at).toLocaleString()}`);
  } else {
    document.fillColor('#9b1c1c').text('Not approved — not for clinical release.');
  }
  document.moveDown();
  document.fontSize(7).fillColor('#555').text('This LIS records analyzer output and professional review. It does not perform autonomous diagnosis.');
};

const reportData = async (id) => {
  const report = await Report.findOne({ id }).lean();
  if (!report) return null;
  const [patient, results] = await Promise.all([
    Patient.findOne({ id: report.patient_id }).lean(),
    Result.find({ patient_id: report.patient_id }).sort({ date: -1 }).lean(),
  ]);
  return { report, patient, results };
};

const reportPdfBuffer = (data) => new Promise((resolve, reject) => {
  const document = new PDFDocument({ margin: 42, size: 'A4' });
  const buffers = [];
  document.on('data', (chunk) => buffers.push(chunk));
  document.on('end', () => resolve(Buffer.concat(buffers)));
  document.on('error', reject);
  drawReportPdf(document, data);
  document.end();
});

app.post('/api/reports/generate', allowRoles('admin', 'technician', 'pathologist'), async (req, res) => {
  try {
    const { patientId, reportType, findings, doctorNotes, machineParameters, sourceAnalyzerResultId } = req.body;
    const reportId = `REP-${Date.now()}`;
    const now = new Date().toISOString();
    const patient = await Patient.findOne({ id: patientId }).lean();
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });
    await Report.create({
      id: reportId,
      patient_id: patientId,
      report_type: reportType,
      status: 'DRAFT',
      generated_at: now,
      findings,
      doctor_notes: doctorNotes,
      ...(Array.isArray(machineParameters) ? { machine_parameters: machineParameters } : {}),
      ...(sourceAnalyzerResultId ? { source_analyzer_result_id: sourceAnalyzerResultId } : {}),
    });
    await logAudit('report_created', reportId, req.user.id, 'Draft report created.', { req, entity: 'Report' });
    res.status(201).json({ id: reportId, status: 'DRAFT', message: 'Draft report created. Pathologist approval is required before release.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/update', allowRoles('admin', 'technician', 'pathologist'), async (req, res) => {
  try {
    const { id, findings, doctorNotes, reportType, machineParameters, sourceAnalyzerResultId } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Report id is required' });
    }

    const existing = await Report.findOne({ id });
    if (!existing) return res.status(404).json({ error: 'Report not found' });
    if (existing.status === 'APPROVED') return res.status(409).json({ error: 'Approved reports cannot be overwritten. Create a revision.' });
    const update = {};
    if (findings !== undefined) update.findings = findings;
    if (doctorNotes !== undefined) update.doctor_notes = doctorNotes;
    if (reportType) update.report_type = reportType;
    if (machineParameters !== undefined) update.machine_parameters = machineParameters;
    if (sourceAnalyzerResultId) update.source_analyzer_result_id = sourceAnalyzerResultId;

    const report = await Report.findOneAndUpdate({ id }, update, { new: true });

    const analyzerResultId = sourceAnalyzerResultId || report.source_analyzer_result_id;
    if (analyzerResultId && Array.isArray(machineParameters)) {
      const analyzerResult = await AnalyzerResult.findById(analyzerResultId);
      if (!analyzerResult) {
        return res.status(404).json({ error: 'Source analyzer result not found' });
      }

      const reviewedParameters = { ...(analyzerResult.reviewed_parameters || {}) };
      for (const parameter of machineParameters) {
        if (parameter?.isSubheading) continue;
        const parameterCode = parameter.sourceParameterCode || parameter.code;
        if (!parameterCode) continue;

        const original = analyzerResult.parameters?.[parameterCode] || {};
        reviewedParameters[parameterCode] = {
          ...original,
          testName: parameter.name || original.testName || parameterCode,
          value: parameter.value ?? '',
          unit: parameter.unit ?? original.unit ?? '',
          referenceRange: parameter.range ?? original.referenceRange ?? '',
          abnormalFlag: parameter.status === 'High' ? 'H' : parameter.status === 'Low' ? 'L' : '',
        };
      }
      await AnalyzerResult.findByIdAndUpdate(analyzerResultId, { reviewed_parameters: reviewedParameters });
    }

    await logAudit('report_updated', id, req.user.id, 'Report manually edited by user', { req, entity: 'Report', oldValue: existing.toObject(), newValue: update });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/verify', allowRoles('admin', 'pathologist'), async (req, res) => {
  try {
    const { id } = req.body;
    const report = await Report.findOne({ id });
    if (!report) return res.status(404).json({ error: 'Report not found.' });
    if (report.status === 'APPROVED') return res.status(409).json({ error: 'Report is already approved.' });
    const signedAt = new Date().toISOString();
    report.status = 'APPROVED';
    report.verified_at = signedAt;
    report.approval = {
      pathologist_id: req.user.id,
      pathologist_name: req.user.name,
      signed_at: signedAt,
      comment: String(req.body?.comment || ''),
    };
    await report.save();
    await logAudit('report_approved', id, req.user.id, 'Report approved by pathologist.', { req, entity: 'Report', newValue: report.approval });
    res.json({ message: 'Report approved. The PDF records the approving pathologist and timestamp.', report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/:id/revise', allowRoles('admin', 'pathologist'), async (req, res) => {
  try {
    const original = await Report.findOne({ id: req.params.id });
    const reason = String(req.body?.reason || '').trim();
    if (!original) return res.status(404).json({ error: 'Report not found.' });
    if (!reason) return res.status(400).json({ error: 'A revision reason is required.' });
    if (original.status !== 'APPROVED') return res.status(409).json({ error: 'Only an approved report can be revised.' });
    const revision = await Report.create({
      id: `REP-${Date.now()}`,
      patient_id: original.patient_id,
      report_type: req.body?.reportType || original.report_type,
      status: 'REVISED',
      generated_at: new Date().toISOString(),
      findings: req.body?.findings ?? original.findings,
      doctor_notes: `${original.doctor_notes || ''}${original.doctor_notes ? '\n' : ''}Revision reason: ${reason}`,
      machine_parameters: req.body?.machineParameters ?? original.machine_parameters,
      source_analyzer_result_id: original.source_analyzer_result_id,
      revision: (original.revision || 1) + 1,
      previous_report_id: original.id,
    });
    await logAudit('report_revised', revision.id, req.user.id, `Revision created from ${original.id}: ${reason}`, { req, entity: 'Report', oldValue: original.toObject(), newValue: revision.toObject() });
    res.status(201).json(revision);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/:id/pdf', async (req, res) => {
  try {
    const data = await reportData(req.params.id);
    if (!data) return res.status(404).json({ error: 'Report not found.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${data.report.id}.pdf"`);
    const document = new PDFDocument({ margin: 42, size: 'A4' });
    document.on('error', (error) => { if (!res.headersSent) res.status(500).json({ error: error.message }); });
    document.pipe(res);
    drawReportPdf(document, data);
    document.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reports/distribute', allowRoles('admin', 'pathologist'), async (req, res) => {
  try {
    const { id, channel = 'EMAIL' } = req.body;
    if (channel !== 'EMAIL') return res.status(501).json({ error: 'WhatsApp delivery needs a configured provider adapter; no message was sent.' });
    const data = await reportData(id);
    if (!data) return res.status(404).json({ error: 'Report not found.' });
    if (data.report.status !== 'APPROVED') return res.status(409).json({ error: 'Only an approved report may be distributed.' });
    if (!data.patient?.email) return res.status(400).json({ error: 'Patient email is missing.' });
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM) {
      return res.status(503).json({ error: 'SMTP is not configured; no email was sent.' });
    }
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: data.patient.email,
      subject: `${process.env.LAB_NAME || 'Smart Lab'} report ${data.report.id}`,
      text: 'Your approved laboratory report is attached. Please contact the laboratory for clinical interpretation.',
      attachments: [{ filename: `${data.report.id}.pdf`, content: await reportPdfBuffer(data), contentType: 'application/pdf' }],
    });
    await Report.findOneAndUpdate({ id }, { distributed_at: new Date().toISOString() });
    await logAudit('report_emailed', id, req.user.id, `Approved report emailed to ${data.patient.email}`, { req, entity: 'Report' });
    res.json({ message: 'Approved report sent by email.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/daily', allowRoles('admin', 'technician', 'pathologist'), async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Use date in YYYY-MM-DD format.' });

    // The LIS UI operates in India; calculating the day range explicitly keeps
    // a late-night patient/report on the clinical day selected in the UI.
    const start = new Date(`${date}T00:00:00.000+05:30`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const range = { $gte: start.toISOString(), $lt: end.toISOString() };
    const [registeredPatients, collectedSamples, reports, resultRows] = await Promise.all([
      Patient.find({ date: range }).lean(),
      Sample.find({ collection_date: range }).lean(),
      Report.find({ generated_at: range }).sort({ generated_at: -1 }).lean(),
      Result.find({ date: range }).sort({ date: -1 }).lean(),
    ]);

    const patientIds = [...new Set([
      ...registeredPatients.map((patient) => patient.id),
      ...collectedSamples.map((sample) => sample.patient_id),
      ...reports.map((report) => report.patient_id),
      ...resultRows.map((result) => result.patient_id),
    ].filter(Boolean))];
    const patientRows = patientIds.length ? await Patient.find({ id: { $in: patientIds } }).lean() : [];
    const samplesByPatient = new Map();
    const reportsByPatient = new Map();
    const resultsByPatient = new Map();
    for (const sample of collectedSamples) {
      const rows = samplesByPatient.get(sample.patient_id) || [];
      rows.push(sample); samplesByPatient.set(sample.patient_id, rows);
    }
    for (const report of reports) {
      const rows = reportsByPatient.get(report.patient_id) || [];
      rows.push(report); reportsByPatient.set(report.patient_id, rows);
    }
    for (const result of resultRows) {
      const rows = resultsByPatient.get(result.patient_id) || [];
      rows.push(result); resultsByPatient.set(result.patient_id, rows);
    }

    const patients = patientRows
      .map((patient) => ({
        ...patient,
        registeredToday: registeredPatients.some((row) => row.id === patient.id),
        samples: samplesByPatient.get(patient.id) || [],
        reports: reportsByPatient.get(patient.id) || [],
        results: resultsByPatient.get(patient.id) || [],
      }))
      .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));

    res.json({
      date,
      summary: {
        patientsRegistered: registeredPatients.length,
        samplesCollected: collectedSamples.length,
        resultsReceived: resultRows.length,
        reportsGenerated: reports.length,
        reportsApproved: reports.filter((report) => report.status === 'APPROVED').length,
      },
      patients,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history', allowRoles('admin'), async (req, res) => {
  try {
    const rows = await AuditLog.find().sort({ timestamp: -1 }).limit(50);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/billing', allowRoles('admin'), async (req, res) => {
  try {
    const rows = await Invoice.aggregate([
      { $sort: { date: -1 } },
      {
        $lookup: {
          from: 'patients',
          localField: 'patient_id',
          foreignField: 'id',
          as: 'patient',
        },
      },
      { $unwind: { path: '$patient', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: 1,
          patient_id: 1,
          amount: 1,
          discount: 1,
          status: 1,
          payment_method: 1,
          date: 1,
          items: 1,
          patient_name: '$patient.name',
        },
      },
    ]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/billing/create', allowRoles('admin'), async (req, res) => {
  try {
    const { patientId, amount, items, discount, status, paymentMethod } = req.body;
    if (!patientId || !items || !Number.isFinite(Number(amount))) {
      return res.status(400).json({ error: 'Patient, tests and a valid amount are required.' });
    }
    const invoiceId = `INV-${Date.now()}`;
    const now = new Date().toISOString();
    const invoice = await Invoice.create({
      id: invoiceId,
      patient_id: patientId,
      amount: Number(amount),
      discount: Number(discount) || 0,
      status: status || 'Pending',
      payment_method: paymentMethod || '',
      date: now,
      items,
    });
    const patient = await Patient.findOne({ id: patientId }).lean();
    res.json({
      ...invoice.toObject(),
      patient_name: patient?.name || 'Unknown',
      patient_phone: patient?.phone || '',
      message: 'Invoice created',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.path });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('Request failed:', error.message || error);
  const status = error.status || 500;
  res.status(status).json({ error: status >= 500 ? 'Internal server error.' : error.message });
});

const PORT = Number.parseInt(process.env.PORT || '5000', 10);
const HOST = '0.0.0.0';

httpServer.on('error', (err) => {
  console.error('Server failed to start:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Close the other server or set PORT to a different port.`);
  }
  process.exit(1);
});

const startServer = async () => {
  try {
    if (!process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32)) {
      throw new Error('JWT_SECRET must be configured with at least 32 characters in production.');
    }

    await connectDB();
    httpServer.listen(PORT, HOST, () => {
      console.log(`Smart Lab API listening on ${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('Server startup failed; HTTP server was not started:', error.message || error);
    process.exit(1);
  }
};

startServer();
