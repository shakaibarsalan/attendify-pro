import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getStudentSocket(): Socket | null {
  return socket;
}

export function connectStudentSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(`${window.location.origin}/student`, {
    path: '/socket.io/',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[socket] Student connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] Student disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectStudentSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function onNotification(callback: (data: unknown) => void) {
  socket?.on('notification:new', callback);
  return () => { socket?.off('notification:new', callback); };
}

export function onAttendanceConfirmed(callback: (data: unknown) => void) {
  socket?.on('attendance:confirmed', callback);
  return () => { socket?.off('attendance:confirmed', callback); };
}
