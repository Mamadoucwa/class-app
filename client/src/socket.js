import { io } from 'socket.io-client';

// 🔥 URL en dur pour la production (Render)
// Si tu veux tester en local, remplace par 'http://localhost:3001'
const URL = 'https://class-app-2ozw.onrender.com';

export const socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity, // 🔥 Ne jamais abandonner
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 60000, // 🔥 60 secondes de timeout
  transports: ['websocket', 'polling'], // 🔥 Essayer WebSocket d'abord
});