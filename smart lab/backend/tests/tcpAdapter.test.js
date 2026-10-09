import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { TcpClientAdapter } from '../machineIntegration/communication/tcpAdapter.js';

test('TCP client adapter receives a real MLLP-framed message without treating chunks as records', async () => {
  const server = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.write('\x0bMSH|^~\\&|ANALYZER\rPID|1||P-1\rOBR|1|ORD|LAB-1|T^Test\rOBX|1|NM|T^Test||1|u|0-2|N\x1c\r');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  let resolveMessage;
  const received = new Promise((resolve) => { resolveMessage = resolve; });
  const adapter = new TcpClientAdapter({
    analyzer: { ip_address: '127.0.0.1', port, protocol: 'HL7', timeout: 1000, reconnect_interval: 1000 },
    onStatus: () => {},
    onMessage: (raw) => resolveMessage(raw),
  });
  try {
    const probe = await adapter.testConnection();
    assert.equal(probe.reachable, true);
    await adapter.connect();
    const raw = await received;
    assert.match(raw, /^\x0bMSH\|/);
    assert.match(raw, /\x1c\r$/);
  } finally {
    await adapter.disconnect();
    await new Promise((resolve) => server.close(resolve));
  }
});
