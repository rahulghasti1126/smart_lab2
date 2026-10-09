import net from 'net';

const normalizeRemoteIp = (address) => (address || '').replace(/^::ffff:/, '');

export const startLocalMachineGateway = ({ host, port, onData, onStatus }) => {
  const clients = new Set();
  const server = net.createServer((socket) => {
    clients.add(socket);
    let forwarding = Promise.resolve();
    const details = {
      remoteIp: normalizeRemoteIp(socket.remoteAddress),
      remotePort: socket.remotePort,
      connectionAt: new Date().toISOString(),
    };

    socket.setNoDelay(true);
    onStatus('CONNECTED', details);
    socket.on('data', (chunk) => {
      forwarding = forwarding
        .then(() => onData(chunk.toString('utf8'), details))
        .then(() => onStatus('DATA RECEIVED', { ...details, byteLength: chunk.length }))
        .catch((error) => {
          console.error(`Machine gateway could not forward analyzer data: ${error.message}`);
          onStatus('ERROR', { ...details, error: error.message });
        });
    });
    socket.on('error', (error) => {
      console.error(`Analyzer TCP socket error [${error.code || 'SOCKET_ERROR'}]: ${error.message}`);
      onStatus('ERROR', { ...details, code: error.code, error: error.message });
    });
    socket.on('close', () => {
      clients.delete(socket);
      forwarding.then(() => onStatus('WAITING FOR ANALYZER', details));
    });
  });

  server.on('error', (error) => {
    console.error(`Machine gateway listener error [${error.code || 'SERVER_ERROR'}]: ${error.message}`);
    onStatus('ERROR', { host, port, code: error.code, error: error.message });
  });
  server.listen(Number(port), host, () => {
    const address = server.address();
    console.log(`Local machine gateway listening on ${host}:${address.port}`);
    onStatus('WAITING FOR ANALYZER', { host, port: address.port });
  });

  return {
    server,
    close: () => new Promise((resolve, reject) => {
      for (const socket of clients) socket.destroy();
      if (!server.listening) return resolve();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
};
