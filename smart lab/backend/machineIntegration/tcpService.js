import net from 'net';
import { EventEmitter } from 'events';

const remoteAddress = (socket) => (socket.remoteAddress || '').replace(/^::ffff:/, '');

export class AnalyzerTcpService extends EventEmitter {
  constructor({ onMessage, onStatus } = {}) {
    super();
    this.socket = null;
    this.server = null;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  listen({ host, port }) {
    this.disconnect();
    this.server = net.createServer((socket) => {
      this.socket = socket;
      const details = { host: remoteAddress(socket), port: socket.remotePort, connectionAt: new Date().toISOString() };
      this.onStatus?.('CONNECTED', details);
      socket.on('data', (chunk) => {
        this.onStatus?.('DATA RECEIVED', { ...details, byteLength: chunk.length });
        this.onMessage?.(chunk.toString('utf8'), details);
      });
      socket.on('error', (error) => this.onStatus?.('ERROR', { ...details, error: error.message }));
      socket.on('close', () => this.onStatus?.('WAITING FOR ANALYZER', details));
    });
    this.server.on('error', (error) => this.onStatus?.('Error', { error: error.message }));
    this.server.listen(Number(port), host, () => this.onStatus?.('WAITING FOR ANALYZER', { host, port: Number(port) }));
    return this.server;
  }

  disconnect() {
    if (this.socket) this.socket.destroy();
    if (this.server) this.server.close();
    this.socket = null;
    this.server = null;
  }

  isConnected() {
    return Boolean(this.socket && !this.socket.destroyed);
  }
}
