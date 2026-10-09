import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { startLocalMachineGateway } from './localGateway.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.gateway') });

const apiBaseUrl = process.env.GATEWAY_API_URL?.trim().replace(/\/+$/, '');
const analyzerId = process.env.GATEWAY_ANALYZER_ID?.trim();
const token = process.env.MACHINE_GATEWAY_TOKEN?.trim();
const host = process.env.GATEWAY_LISTEN_HOST?.trim() || '0.0.0.0';
const port = Number(process.env.GATEWAY_LISTEN_PORT || 8001);

if (!apiBaseUrl || !analyzerId || !token) {
  console.error('Set GATEWAY_API_URL, GATEWAY_ANALYZER_ID, and MACHINE_GATEWAY_TOKEN in backend/.env.gateway.');
  process.exit(1);
}

let apiUrl;
try {
  apiUrl = new URL(apiBaseUrl);
} catch {
  console.error('GATEWAY_API_URL must be a valid HTTP(S) URL.');
  process.exit(1);
}
if (!['http:', 'https:'].includes(apiUrl.protocol)) {
  console.error('GATEWAY_API_URL must use HTTP or HTTPS.');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('GATEWAY_LISTEN_PORT must be between 1 and 65535.');
  process.exit(1);
}
if (token.length < 32) {
  console.error('MACHINE_GATEWAY_TOKEN must contain at least 32 characters.');
  process.exit(1);
}

const sendGatewayRequest = async (path, payload) => {
  const response = await fetch(`${apiBaseUrl}/api/machine-integration/gateway/${encodeURIComponent(analyzerId)}/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Remote API returned HTTP ${response.status}: ${responseBody}`);
  }
};

let statusQueue = Promise.resolve();
const reportStatus = (status, details) => {
  statusQueue = statusQueue
    .then(() => sendGatewayRequest('status', { status, details }))
    .catch((error) => {
      console.error(`Could not report gateway status to backend: ${error.message}`);
    });
};

const gateway = startLocalMachineGateway({
  host,
  port,
  onStatus: reportStatus,
  onData: async (rawMessage, details) => {
    await sendGatewayRequest('messages', {
      rawMessage,
      sourceIp: details.remoteIp,
      connectionAt: details.connectionAt,
    });
  },
});

const shutdown = async () => {
  try {
    await gateway.close();
    process.exit(0);
  } catch (error) {
    console.error(`Could not stop local machine gateway cleanly: ${error.message}`);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
