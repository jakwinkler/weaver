import { useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import { io, type Socket } from 'socket.io-client';

interface UseSocketReturn {
  socket: MutableRefObject<Socket | null>;
  joinProject: (projectKey: string) => void;
  leaveProject: (projectKey: string) => void;
  on: (event: string, handler: (data: unknown) => void) => (() => void);
}

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000/ws';

export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinProject = useCallback((projectKey: string) => {
    socketRef.current?.emit('join:project', { projectKey });
  }, []);

  const leaveProject = useCallback((projectKey: string) => {
    socketRef.current?.emit('leave:project', { projectKey });
  }, []);

  const on = useCallback((event: string, handler: (data: unknown) => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  return { socket: socketRef, joinProject, leaveProject, on };
}
