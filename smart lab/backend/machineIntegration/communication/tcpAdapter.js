import net from 'net';
import { MessageFramer } from './messageFramer.js';

const asIp = (socket) => (socket.remoteAddress || '').replace(/^::ffff:/, '');
const timeoutError = (ms) => Object.assign(new Error(`TCP connection timed out after ${ms}ms.`), { code: 'ETIMEDOUT' });

const tcpProbe = ({ host, port, timeout }) => new Promise((resolve, reject) => {
  const socket = net.createConnection({ host, port });
  const finish = (error) => {
    socket.removeAllListeners();
    socket.destroy();
    error ? reject(error) : resolve({ host, port, reachable: true });
  };
  socket.setTimeout(timeout, () => finish(timeoutError(timeout)));
  socket.once('connect', () => finish());
  socket.once('error', finish);
});

export class TcpClientAdapter {
  constructor({ analyzer, onMessage, onStatus }) {
    this.analyzer = analyzer;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.socket = null;
    this.stopped = true;
    this.reconnectTimer = null;
  }

  async testConnection() {
    return tcpProbe({ host: this.analyzer.ip_address, port: this.analyzer.port, timeout: this.analyzer.timeout || 30000 });
  }

  connect() {
    if (this.socket && !this.socket.destroyed) return Promise.resolve({ status: 'CONNECTED', reused: true });
    this.stopped = false;
    return this.#open();
  }

  #open() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.analyzer.ip_address, port: this.analyzer.port });
      this.socket = socket;
      const details = () => ({ host: this.analyzer.ip_address, port: this.analyzer.port, connectionAt: new Date().toISOString() });
      const framer = new MessageFramer({
        protocol: this.analyzer.protocol,
        onMessage: (rawMessage) => Promise.resolve(this.onMessage(rawMessage, { ...details(), sourceIp: this.analyzer.ip_address, write: (message) => socket.write(message) })).catch((error) => this.onStatus('ERROR', { ...details(), error: error.message })),
      });
      let settled = false;
      const fail = (error) => {
        if (!settled) { settled = true; reject(error); }
        this.onStatus('ERROR', { ...details(), error: error.message, code: error.code });
      };
      socket.setTimeout(this.analyzer.timeout || 30000, () => socket.destroy(timeoutError(this.analyzer.timeout || 30000)));
      socket.on('connect', () => {
        settled = true;
        this.onStatus('CONNECTED', details());
        resolve({ status: 'CONNECTED' });
      });
      socket.on('data', (chunk) => {
        this.onStatus('DATA RECEIVED', { ...details(), byteLength: chunk.length });
        framer.push(chunk);
      });
      socket.on('error', fail);
      socket.on('close', () => {
        framer.close();
        if (this.socket === socket) this.socket = null;
        if (!this.stopped) this.#scheduleReconnect();
        else this.onStatus('DISCONNECTED', details());
      });
    });
  }

  #scheduleReconnect() {
    this.onStatus('RECONNECTING', { host: this.analyzer.ip_address, port: this.analyzer.port });
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.#open().catch(() => {}), this.analyzer.reconnect_interval || 5000);
  }

  async disconnect() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
    this.socket = null;
  }

  get isActive() { return Boolean(this.socket && !this.socket.destroyed); }
}

export class TcpServerAdapter {
  constructor({ analyzer, onMessage, onStatus }) {
    this.analyzer = analyzer;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.server = null;
    this.clients = new Set();
  }

  async testConnection() {
    if (this.server?.listening) return { listener: true, status: 'WAITING_FOR_ANALYZER', host: this.analyzer.server_ip, port: this.analyzer.port };
    // Server mode cannot dial an analyzer. This verifies only that the LIS can
    // bind the configured local interface and port; no connected claim is made.
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', reject);
      probe.listen(this.analyzer.port, this.analyzer.server_ip, () => probe.close(resolve));
    });
    return { listener: false, status: 'LISTENER_BIND_VERIFIED', host: this.analyzer.server_ip, port: this.analyzer.port };
  }

  async connect() {
    if (this.server?.listening) return { status: 'WAITING_FOR_ANALYZER', reused: true };
    const analyzer = this.analyzer;
    this.server = net.createServer((socket) => {
      this.clients.add(socket);
      const details = { sourceIp: asIp(socket), remotePort: socket.remotePort, connectionAt: new Date().toISOString(), write: (message) => socket.write(message) };
      const framer = new MessageFramer({
        protocol: analyzer.protocol,
        onMessage: (rawMessage) => Promise.resolve(this.onMessage(rawMessage, details)).catch((error) => this.onStatus('ERROR', { ...details, error: error.message })),
      });
      this.onStatus('CONNECTED', details);
      socket.on('data', (chunk) => { this.onStatus('DATA RECEIVED', { ...details, byteLength: chunk.length }); framer.push(chunk); });
      socket.on('error', (error) => this.onStatus('ERROR', { ...details, error: error.message, code: error.code }));
      socket.on('close', () => { this.clients.delete(socket); framer.close(); this.onStatus('WAITING_FOR_ANALYZER', details); });
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(analyzer.port, analyzer.server_ip, resolve);
    });
    this.onStatus('WAITING_FOR_ANALYZER', { host: analyzer.server_ip, port: analyzer.port });
    return { status: 'WAITING_FOR_ANALYZER' };
  }

  async disconnect() {
    for (const socket of this.clients) socket.destroy();
    this.clients.clear();
    if (this.server?.listening) await new Promise((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
    this.server = null;
  }

  get isActive() { return Boolean(this.server?.listening); }
}
