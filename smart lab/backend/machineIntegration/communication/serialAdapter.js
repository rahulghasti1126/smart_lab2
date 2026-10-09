import { SerialPort } from 'serialport';
import { MessageFramer } from './messageFramer.js';

const parity = (value) => ['none', 'even', 'odd', 'mark', 'space'].includes(value) ? value : 'none';

export class SerialAdapter {
  constructor({ analyzer, onMessage, onStatus }) {
    this.analyzer = analyzer;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.port = null;
    this.stopped = true;
    this.reconnectTimer = null;
  }

  #options() {
    return {
      path: this.analyzer.serial_port,
      baudRate: Number(this.analyzer.baud_rate) || 9600,
      dataBits: Number(this.analyzer.data_bits) || 8,
      stopBits: Number(this.analyzer.stop_bits) || 1,
      parity: parity(this.analyzer.parity),
      autoOpen: false,
    };
  }

  async testConnection() {
    const port = new SerialPort(this.#options());
    try {
      await new Promise((resolve, reject) => port.open((error) => error ? reject(error) : resolve()));
      return { reachable: true, serialPort: this.analyzer.serial_port, status: 'CONNECTED' };
    } finally {
      if (port.isOpen) await new Promise((resolve) => port.close(() => resolve()));
    }
  }

  async connect() {
    if (this.port?.isOpen) return { status: 'CONNECTED', reused: true };
    this.stopped = false;
    return this.#open();
  }

  async #open() {
    const port = new SerialPort(this.#options());
    this.port = port;
    const details = { sourceIp: this.analyzer.serial_port, connectionAt: new Date().toISOString(), write: (message) => port.write(message) };
    const framer = new MessageFramer({
      protocol: this.analyzer.protocol,
      onMessage: (rawMessage) => Promise.resolve(this.onMessage(rawMessage, details)).catch((error) => this.onStatus('ERROR', { ...details, error: error.message })),
    });
    port.on('data', (chunk) => { this.onStatus('DATA RECEIVED', { ...details, byteLength: chunk.length }); framer.push(chunk); });
    port.on('error', (error) => this.onStatus('ERROR', { ...details, error: error.message, code: error.code }));
    port.on('close', () => {
      framer.close();
      if (this.port === port) this.port = null;
      if (this.stopped) this.onStatus('DISCONNECTED', details);
      else this.#scheduleReconnect();
    });
    await new Promise((resolve, reject) => port.open((error) => error ? reject(error) : resolve()));
    this.onStatus('CONNECTED', details);
    return { status: 'CONNECTED' };
  }

  async disconnect() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    if (this.port?.isOpen) await new Promise((resolve, reject) => this.port.close((error) => error ? reject(error) : resolve()));
    this.port = null;
  }

  #scheduleReconnect() {
    this.onStatus('RECONNECTING', { serialPort: this.analyzer.serial_port });
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.#open().catch((error) => {
      this.onStatus('ERROR', { serialPort: this.analyzer.serial_port, error: error.message });
      if (!this.stopped) this.#scheduleReconnect();
    }), this.analyzer.reconnect_interval || 5000);
  }

  get isActive() { return Boolean(this.port?.isOpen); }
}
