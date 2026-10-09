import { io } from 'socket.io-client';

// Use explicit backend URL when provided, otherwise fall back to localhost:5000
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const currentToken = () => {
  try { return JSON.parse(localStorage.getItem('user') || '{}').token; } catch { return undefined; }
};

// Create a single shared socket instance with reconnection options
const socket = io(SOCKET_URL, {
	transports: ['websocket', 'polling'],
	reconnection: true,
	reconnectionAttempts: 5,
	reconnectionDelay: 1000,
	autoConnect: Boolean(currentToken()),
	auth: (callback) => callback({ token: currentToken() }),
});

export default socket;
