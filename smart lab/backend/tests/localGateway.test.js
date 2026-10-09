import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';
import { once } from 'events';
import { startLocalMachineGateway } from '../machineIntegration/localGateway.js';

test('accepts analyzer TCP data and forwards it with remote connection details', async () => {
  let resolveData;
  const dataReceived = new Promise((resolve) => { resolveData = resolve; });
  const gateway = startLocalMachineGateway({
    host: '127.0.0.1',
    port: 0,
    onStatus: () => {},
    onData: (message, details) => resolveData({ message, details }),
  });
  await once(gateway.server, 'listening');

  const client = net.createConnection(gateway.server.address().port, '127.0.0.1');
  try {
    await once(client, 'connect');
    client.write('HL7 test message');
    const result = await dataReceived;
    assert.equal(result.message, 'HL7 test message');
    assert.equal(result.details.remoteIp, '127.0.0.1');
  } finally {
    client.destroy();
    await gateway.close();
  }
});
