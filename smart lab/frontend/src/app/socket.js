import { io } from 'socket.io-client';

// Use explicit backend URL when provided, otherwise fall back to localhost:5000
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Create a single shared socket instance with reconnection options
const socket = io(SOCKET_URL, {
	transports: ['websocket', 'polling'],
	reconnection: true,
	reconnectionAttempts: 5,
	reconnectionDelay: 1000,
	autoConnect: true,
});

export default socket;
