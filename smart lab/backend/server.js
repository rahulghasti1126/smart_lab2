import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { connectDB, hashPassword, User, Patient, Result, AnalyzerConfig, AnalyzerMessage, AnalyzerResult, Reagent, Report, Invoice, LabSettings, AuditLog } from './database.js';
import { parseAnalyzerData } from './analyzerParser.js';
import { createMachineIntegrationService } from './machineIntegration/service.js';
import { createSimulatorMessage } from './machineIntegration/simulator.js';
import { validateAnalyzerConfig } from './machineIntegration/validation.js';
import { startCippointTcpServer, getCippointTcpServer, stopCippointTcpServer } from './machineIntegration/cippointTcpServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '6mb' }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
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

const machineIntegration = createMachineIntegrationService({ AnalyzerMessage, AnalyzerResult, AuditLog, emit: emitUpdate });

const handleCippointStatus = async (status, details) => {
  const analyzer = await AnalyzerConfig.findOne({ name: 'Cippoint' });
  if (analyzer) await AnalyzerConfig.findByIdAndUpdate(analyzer._id, { connection_status: status, updated_at: new Date().toISOString() });
  if (status === 'ERROR') console.error(`Cippoint listener error: ${details?.error || 'Unknown TCP server error'}`);
  emitUpdate('machine-integration-status', { analyzerId: analyzer?._id, status, details, error: details?.error || null });
};

const handleCippointData = async (rawData, details) => {
  const analyzer = await AnalyzerConfig.findOne({ name: 'Cippoint' });
  if (!analyzer) return console.error('Cippoint raw message was received, but no Cippoint analyzer configuration exists.');
  try {
    await machineIntegration.receiveRawMessage({ analyzer, rawMessage: rawData, sourceIp: details.remoteIp, connectionAt: details.connectionAt, captureOnly: true });
  } catch (error) {
    console.error(`Cippoint raw message storage error: ${error.message}`);
    await handleCippointStatus('ERROR', { ...details, error: error.message });
  }
};

const requireMachineAdmin = async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];
    const user = userId ? await User.findOne({ id: userId }).select('role') : null;
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' });
    req.machineAdmin = userId;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAnalyzerOr404 = async (req, res) => {
  const analyzer = await AnalyzerConfig.findById(req.params.id);
  if (!analyzer) {
    res.status(404).json({ error: 'Analyzer not found.' });
    return null;
  }
  return analyzer;
};

app.get('/api/machine-integration/analyzers', async (req, res) => {
  try {
    res.json(await AnalyzerConfig.find().sort({ name: 1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/machine-integration/analyzers', requireMachineAdmin, async (req, res) => {
  try {
    const input = { ...req.body, model: req.body?.model || 'Cippoint Immunofluorescence Quantitative Analyzer', tcpMode: req.body?.tcpMode || 'CLIENT' };
    const validation = validateAnalyzerConfig(input);
    if (!validation.valid) return res.status(400).json({ error: validation.errors.join(' ') });
    const analyzer = await AnalyzerConfig.create({
      name: input.name.trim(),
      model: input.model,
      ip_address: input.ipAddress.trim(),
      server_ip: input.serverIp.trim(),
      port: Number(input.port),
      connection_type: input.connectionType || 'NETWORK',
      tcp_mode: input.tcpMode,
      protocol: input.protocol,
      auto_connect: Boolean(input.autoConnect),
      auto_receive: input.autoReceive !== false,
      enabled: Boolean(input.enabled),
      updated_at: new Date().toISOString(),
    });
    await logAudit('analyzer_configured', String(analyzer._id), req.headers['x-user-id'] || 'admin', `Configured ${analyzer.name}`);
    res.status(201).json(analyzer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/machine-integration/analyzers/:id', requireMachineAdmin, async (req, res) => {
  try {
    const analyzer = await getAnalyzerOr404(req, res);
    if (!analyzer) return;
    const input = { ...analyzer.toObject(), ...req.body, ipAddress: req.body.ipAddress ?? analyzer.ip_address, serverIp: req.body.serverIp ?? analyzer.server_ip, tcpMode: req.body.tcpMode ?? analyzer.tcp_mode };
    const validation = validateAnalyzerConfig(input);
    if (!validation.valid) return res.status(400).json({ error: validation.errors.join(' ') });
    Object.assign(analyzer, {
      name: input.name,
      model: input.model || analyzer.model,
      ip_address: input.ipAddress,
      server_ip: input.serverIp,
      port: Number(input.port),
      connection_type: input.connectionType || analyzer.connection_type,
      tcp_mode: input.tcpMode,
      protocol: input.protocol,
      auto_connect: input.autoConnect ?? analyzer.auto_connect,
      auto_receive: input.autoReceive ?? analyzer.auto_receive,
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

    let isConnected = false;
    let status = 'STOPPED';

    if (analyzer.tcp_mode === 'SERVER') {
      const server = dynamicServers[analyzer._id];
      isConnected = Boolean(server && server.listening);
      status = isConnected ? 'WAITING FOR ANALYZER' : 'STOPPED';
    } else {
      const client = dynamicClients[analyzer._id];
      isConnected = Boolean(client && !client.destroyed);
      status = isConnected ? 'CONNECTED' : 'STOPPED';
    }

    res.json({
      connected: isConnected,
      status,
      message: isConnected ? 'Connection is active.' : 'Connection is inactive.',
      host: analyzer.tcp_mode === 'SERVER' ? analyzer.server_ip : analyzer.ip_address,
      port: analyzer.port,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const dynamicServers = {};
const dynamicClients = {};

app.post('/api/machine-integration/analyzers/:id/connect', requireMachineAdmin, async (req, res) => {
  try {
    const analyzer = await getAnalyzerOr404(req, res);
    if (!analyzer) return;

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
            await machineIntegration.receiveRawMessage({ analyzer, rawMessage: rawData, sourceIp: remoteIp, connectionAt: new Date().toISOString(), captureOnly: true });
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
          await machineIntegration.receiveRawMessage({ analyzer, rawMessage: str, sourceIp: analyzer.ip_address, connectionAt: new Date().toISOString(), captureOnly: true });
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
    const rawMessage = req.body?.rawMessage || createSimulatorMessage(req.body);
    const result = await machineIntegration.receiveRawMessage({ analyzer, rawMessage, sourceIp: 'simulator', source: 'simulator', captureOnly: true });
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

let activePort = null;
let parser = null;
let tcpBuffer = '';
let pendingMachineCommand = null;
let pendingMachineTimer = null;

const logAudit = async (event, subject, actor, details) => {
  try {
    if (AuditLog && typeof AuditLog.create === 'function') {
      await AuditLog.create({
        event,
        subject,
        actor,
        timestamp: new Date().toISOString(),
        details: details || '',
      });
    }
  } catch (err) {
    console.error('Audit log failed:', err?.message || err);
  }
};

const ensureCippointConfiguration = async () => {
  const existing = await AnalyzerConfig.findOne({ name: 'Cippoint' });
  if (existing) return existing;
  return AnalyzerConfig.create({
    name: 'Cippoint',
    model: 'Cippoint Immunofluorescence Quantitative Analyzer',
    ip_address: '192.168.1.12',
    server_ip: '192.168.1.10',
    port: 8001,
    connection_type: 'NETWORK',
    tcp_mode: 'SERVER',
    protocol: 'HL7',
    auto_receive: true,
    enabled: true,
    connection_status: 'STOPPED',
  });
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
  const { path, baudRate = 9600, delimiter = '\r\n' } = req.body;

  if (!path) {
    return res.status(400).json({ error: 'Serial port path is required.' });
  }

  // If already connected to the same path, keep it open until user requests disconnect
  try {
    if (activePort && activePort.isOpen) {
      const currentPath = activePort.path || (activePort.settings && activePort.settings.path) || null;
      if (currentPath === path) {
        return res.json({ message: `Already connected to ${path}` });
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
      emitUpdate('machine-waiting', { path, status: 'Waiting' });
      res.json({ message: `Port ${path} opened; waiting for analyzer data.`, status: 'Waiting', portOpen: true, connected: false });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/connect-network', async (req, res) => {
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
  const parsed = parseAnalyzerData(data);
  if (!parsed) {
    emitUpdate('raw-analyzer-data', { raw: `${data}` });
    return;
  }

  const { patientId, testName, resultValue, unit, referenceRange, machineName, status, raw_data } = parsed;
  const storedPatientId = patientId || 'unknown';

  try {
    const result = await Result.create({
      patient_id: storedPatientId,
      test_name: testName,
      result_value: resultValue,
      unit,
      reference_range: referenceRange,
      machine_name: machineName,
      status,
      date: new Date().toISOString(),
      raw_data,
    });

    if (patientId) {
      const patient = await Patient.findOneAndUpdate(
        { id: patientId },
        { status: status === 'completed' ? 'completed' : 'pending' },
        { new: true }
      );

      if (patient) {
        emitUpdate('patient-updated', {
          id: patientId,
          status: patient.status,
        });
      }
    }

    const payload = {
      id: result._id,
      patient_id: storedPatientId,
      test_name: testName,
      result_value: resultValue,
      unit,
      reference_range: referenceRange,
      machine_name: machineName,
      status,
      date: result.date,
      raw_data,
    };
    console.log('Emitting result-created:', JSON.stringify(payload));
    emitUpdate('result-created', payload);

    await logAudit('analyzer_data', `Patient ${storedPatientId}`, 'system', `Parsed result for ${testName}`);
  } catch (err) {
    console.error('Analyzer data save error:', err.message);
  }
};

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const passwordHash = hashPassword(password);
    const normalizedUsername = username?.toLowerCase?.().trim();
    const user = await User.findOne({
      username: new RegExp(`^${normalizedUsername}$`, 'i'),
      password_hash: passwordHash,
    }).select('id username name role');
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, role = 'technician' } = req.body;
    const normalizedUsername = username?.toLowerCase?.().trim();
    const normalizedName = name?.trim?.();

    if (!normalizedUsername || !password || !normalizedName) {
      return res.status(400).json({ error: 'Username, password, and name are required.' });
    }

    const existing = await User.findOne({ username: normalizedUsername });
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const passwordHash = hashPassword(password);
    const userId = `U${Date.now()}`;

    await User.create({
      id: userId,
      username: normalizedUsername,
      password_hash: passwordHash,
      name: normalizedName,
      role,
      created_at: new Date().toISOString(),
    });

    await logAudit('user_registered', normalizedUsername, role, `New user ${normalizedUsername} registered as ${role}`);
    res.json({ id: userId, username: normalizedUsername, name: normalizedName, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patients/add', async (req, res) => {
  try {
    const p = req.body;
    const patientId = `P${Date.now()}`;
    await Patient.create({
      id: patientId,
      name: p.patientName,
      age: p.age,
      gender: p.gender,
      phone: p.phone,
      email: p.email,
      doctor: p.doctor,
      date: new Date().toISOString(),
      status: 'pending',
    });

    await logAudit('patient_registered', patientId, p.doctor || 'unknown', `Patient ${p.patientName} registered`);
    res.json({ id: patientId, message: 'Patient registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/patients/:id/tests', async (req, res) => {
  try {
    const { id } = req.params;
    const { testName, machineName } = req.body;

    const result = await Result.create({
      patient_id: id,
      test_name: testName,
      machine_name: machineName,
      status: 'Pending',
      date: new Date().toISOString(),
    });

    res.json({ message: 'Test added successfully', result });
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

app.post('/api/results/add', async (req, res) => {
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
      status: status || 'completed',
      date: now,
      raw_data: 'manual-entry',
    });

    await Patient.findOneAndUpdate({ id: patientId }, { status: 'completed' });
    await logAudit('result_added', patientId, 'technician', `${testName} result recorded`);
    emitUpdate('result-created', result);
    res.json({ id: result._id, message: 'Result recorded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/results/update', async (req, res) => {
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

    const result = await Result.findByIdAndUpdate(id, updateFields, { new: true });
    if (!result) {
      return res.status(404).json({ error: 'Result not found' });
    }

    await logAudit('result_updated', id, 'technician', 'Result value updated manually');
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

app.post('/api/reagents/update', async (req, res) => {
  try {
    const { id, stock } = req.body;
    await Reagent.findByIdAndUpdate(id, { stock });
    res.json({ message: 'Reagent stock updated' });
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

app.post('/api/billing/payment-qr', async (req, res) => {
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

app.post('/api/reports/generate', async (req, res) => {
  try {
    const { patientId, reportType, findings, doctorNotes } = req.body;
    const reportId = `REP-${Date.now()}`;
    const now = new Date().toISOString();
    await Report.create({
      id: reportId,
      patient_id: patientId,
      report_type: reportType,
      status: 'Generated',
      generated_at: now,
      findings,
      doctor_notes: doctorNotes,
    });
    res.json({ id: reportId, message: 'Report generated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/update', async (req, res) => {
  try {
    const { id, findings, doctorNotes, reportType } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Report id is required' });
    }

    const update = {};
    if (findings !== undefined) update.findings = findings;
    if (doctorNotes !== undefined) update.doctor_notes = doctorNotes;
    if (reportType) update.report_type = reportType;

    const report = await Report.findOneAndUpdate({ id }, update, { new: true });
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    await logAudit('report_updated', id, 'technician', 'Report manually edited by user');
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/verify', async (req, res) => {
  try {
    const { id } = req.body;
    await Report.findOneAndUpdate({ id }, { status: 'Verified', verified_at: new Date().toISOString() });
    await logAudit('report_verified', id, 'technician', 'Report verified by user');
    res.json({ message: 'Report verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/distribute', async (req, res) => {
  try {
    const { id } = req.body;
    await Report.findOneAndUpdate({ id }, { status: 'Distributed', distributed_at: new Date().toISOString() });
    await logAudit('report_distributed', id, 'technician', 'Report distributed to patient');
    res.json({ message: 'Report distributed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const rows = await AuditLog.find().sort({ timestamp: -1 }).limit(50);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/billing', async (req, res) => {
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

app.post('/api/billing/create', async (req, res) => {
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

app.get('/api', (req, res) => {
  res.json({ status: 'ok', message: 'Smart Lab API is available' });
});

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.path });
});

// Serve frontend static files
const distPath = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(distPath));

// Fallback all client-side navigation requests to index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;

startCippointTcpServer({ onData: handleCippointData, onStatus: handleCippointStatus });

connectDB()
  .then(async () => {
    console.log('MongoDB connected');
    await ensureCippointConfiguration();
  })
  .catch((err) => console.error('MongoDB connection failed:', err?.message || err));

httpServer.listen(PORT, () => {
  console.log(`LIS Middleware running on http://localhost:${PORT}`);
});

httpServer.on('error', (err) => {
  console.error('Server failed to start:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Close the other server or set PORT to a different port.`);
  }
  process.exit(1);
});
