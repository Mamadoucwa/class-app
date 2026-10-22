import { io } from 'socket.io-client';

// 🔑 URL EN DUR de ton backend sur LWS
const URL = 'https://class-app-2ozw.onrender.com';

export const socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 60000,
  transports: ['websocket', 'polling'],
});