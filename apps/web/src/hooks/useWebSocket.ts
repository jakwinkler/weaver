import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores';
import { API_BASE_URL } from '@/api/client';
import {
  DOMAIN_EVENTS,
  getInvalidationKeys,
  getToastMessageForEvent,
  type WsEventPayload,
} from './websocketEvents';

/** Minimal toast display without requiring a toast library */
function showToast(message: string) {
  const container = document.getElementById('ws-toast-container') ?? createToastContainer();
  const toast = document.createElement('div');
  toast.className = 'ws-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function createToastContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'ws-toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-atomic', 'false');
  document.body.appendChild(container);

  return container;
}

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const tenantId = useAuthStore((s) => s.tenantId);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const handleEvent = useCallback(
    (event: string, payload: WsEventPayload) => {
      const data = payload.data ?? {};

      // Invalidate relevant queries
      const keys = getInvalidationKeys(event, data);
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key });
      }

      // Show toast for events from other users
      const message = getToastMessageForEvent(event, data, currentUserId);
      if (message) {
        showToast(message);
      }
    },
    [queryClient, currentUserId],
  );

  useEffect(() => {
    if (!tenantId) {
      return;
    }

    // Derive WebSocket URL from API base URL (socket.io handles ws:// upgrade)
    const wsUrl = API_BASE_URL.replace('/api/v1', '');

    const socket = io(`${wsUrl}/ws`, {
      withCredentials: true,
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    // Listen for all domain events the server emits
    for (const event of DOMAIN_EVENTS) {
      socket.on(event, (payload: WsEventPayload) => {
        handleEvent(event, payload);
      });
    }

    socket.on('connect', () => {
      // eslint-disable-next-line no-console
      console.debug('[WS] connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      // eslint-disable-next-line no-console
      console.debug('[WS] disconnected:', reason);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tenantId, handleEvent]);

  /** Join a project room for project-scoped events */
  const joinProject = useCallback((projectKey: string) => {
    socketRef.current?.emit('join:project', { projectKey });
  }, []);

  /** Leave a project room */
  const leaveProject = useCallback((projectKey: string) => {
    socketRef.current?.emit('leave:project', { projectKey });
  }, []);

  return { joinProject, leaveProject };
}
