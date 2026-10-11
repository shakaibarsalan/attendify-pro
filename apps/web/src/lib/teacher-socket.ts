import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getTeacherSocket(): Socket | null {
  return socket;
}

export function connectTeacherSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(`${window.location.origin}/teacher`, {
    path: '/socket.io/',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[socket] Teacher connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] Teacher disconnected:', reason);
  });

  return socket;
}

export function disconnectTeacherSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinSessionRoom(sessionId: string) {
  socket?.emit('join:session', sessionId);
}

export function leaveSessionRoom(sessionId: string) {
  socket?.emit('leave:session', sessionId);
}

export function onAttendanceMarked(callback: (data: { studentId: string; studentName: string; sessionId: string; method: string; markedAt: string }) => void) {
  socket?.on('attendance:marked', callback);
  return () => { socket?.off('attendance:marked', callback); };
}

export function onFraudFlagged(callback: (data: unknown) => void) {
  socket?.on('attendance:fraud_flagged', callback);
  return () => { socket?.off('attendance:fraud_flagged', callback); };
}
