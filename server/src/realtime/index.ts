import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

let io: SocketIOServer | null = null;

export function initRealtime(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.cors.origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io/',
  });

  const teacherNs = io.of('/teacher');
  const studentNs = io.of('/student');

  teacherNs.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, config.jwt.secret) as {
        id: string;
        role: string;
      };
      if (!['teacher', 'org_admin', 'system_admin'].includes(payload.role)) {
        return next(new Error('Insufficient permissions'));
      }
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  teacherNs.on('connection', (socket) => {
    socket.on('join:session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
    });
    socket.on('leave:session', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
    });
    socket.on('disconnect', () => {});
  });

  studentNs.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token, config.jwt.secret) as {
        id: string;
        role: string;
      };
      if (payload.role !== 'student') {
        return next(new Error('Only students can connect'));
      }
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  studentNs.on('connection', (socket) => {
    const user = (socket as any).user;
    socket.join(`user:${user.id}`);
    socket.on('disconnect', () => {});
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function emitToTeachers(sessionId: string, event: string, data: unknown) {
  if (!io) return;
  io.of('/teacher').to(`session:${sessionId}`).emit(event, data);
}

export function emitToStudent(userId: string, event: string, data: unknown) {
  if (!io) return;
  io.of('/student').to(`user:${userId}`).emit(event, data);
}
