import net from 'net';

const HOST = '0.0.0.0';
const PORT = 8001;

let server = null;
const clients = new Set();

const normalizeRemoteIp = (address) => (address || '').replace(/^::ffff:/, '');

export const getCippointTcpServer = () => server;

export const startCippointTcpServer = ({ onData, onStatus } = {}) => {
  if (server?.listening) return server;

  server = net.createServer((socket) => {
    clients.add(socket);
    const remoteIp = normalizeRemoteIp(socket.remoteAddress);
    const connectionAt = new Date().toISOString();
    const details = { remoteIp, remotePort: socket.remotePort, connectionAt };

    console.log('Cippoint connected');
    console.log(`Remote IP: ${remoteIp}`);
    onStatus?.('CONNECTED', details);

    socket.on('data', (chunk) => {
      const rawData = chunk.toString('utf8');
      console.log('RAW DATA RECEIVED:');
      console.log(rawData);
      console.log(`Received byte length: ${chunk.length}`);
      onStatus?.('DATA RECEIVED', { ...details, byteLength: chunk.length });
      onData?.(rawData, details);
    });

    socket.on('error', (error) => {
      console.error(`Cippoint socket error [${error.code || 'SOCKET_ERROR'}]: ${error.message}`);
      onStatus?.('ERROR', { ...details, code: error.code, error: error.message });
    });

    socket.on('close', () => {
      clients.delete(socket);
      console.log(`Cippoint disconnected: ${remoteIp}`);
      onStatus?.('WAITING FOR ANALYZER', details);
    });
  });

  server.on('error', (error) => {
    console.error(`Cippoint TCP Server error [${error.code || 'SERVER_ERROR'}]: ${error.message}`);
    onStatus?.('ERROR', { host: HOST, port: PORT, code: error.code, error: error.message });
  });

  server.listen(PORT, HOST, () => {
    console.log('Cippoint TCP Server started');
    console.log(`Listening on ${HOST}:${PORT}`);
    console.log('Waiting for Cippoint analyzer...');
    onStatus?.('WAITING FOR ANALYZER', { host: HOST, port: PORT });
  });

  return server;
};

export const stopCippointTcpServer = () => new Promise((resolve) => {
  if (!server) return resolve();
  for (const socket of clients) socket.destroy();
  clients.clear();
  if (!server.listening) {
    server = null;
    return resolve();
  }
  server.close(() => {
    server = null;
    resolve();
  });
});

export { HOST as CIPPOINT_TCP_HOST, PORT as CIPPOINT_TCP_PORT };
