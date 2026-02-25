import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores';
import { API_BASE_URL } from '@/api/client';

export interface WsEventPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/** Map domain events to React Query keys that should be invalidated */
function getInvalidationKeys(event: string, data: Record<string, unknown>): string[][] {
  const issueKey = data.issueKey as string | undefined;
  const projectKey = data.projectKey as string | undefined;

  switch (event) {
    case 'issue.created':
      return [
        ['issues'],
        ...(projectKey ? [['issues', projectKey]] : []),
        ['dashboard'],
      ];
    case 'issue.updated':
    case 'issue.assigned':
      return [
        ...(issueKey ? [['issue', issueKey]] : []),
        ['issues'],
        ['boards'],
        ['dashboard'],
      ];
    case 'issue.moved':
    case 'issue.status_changed':
      return [
        ...(issueKey ? [['issue', issueKey]] : []),
        ['issues'],
        ['boards'],
        ['dashboard'],
      ];
    case 'issue.deleted':
      return [
        ['issues'],
        ['boards'],
        ['dashboard'],
      ];
    case 'comment.created':
    case 'comment.deleted':
      return [
        ...(issueKey ? [['comments', issueKey]] : []),
        ...(issueKey ? [['activity', issueKey]] : []),
      ];
    case 'project.created':
    case 'project.updated':
      return [
        ['projects'],
        ...(projectKey ? [['project', projectKey]] : []),
        ['dashboard'],
      ];
    case 'checklist.item_added':
    case 'checklist.item_completed':
    case 'checklist.item_removed':
      return [
        ...(issueKey ? [['activity', issueKey]] : []),
        ...(issueKey ? [['checklist', issueKey]] : []),
      ];
    default:
      return [];
  }
}

/** Build a human-readable toast message for events from other users */
function buildToastMessage(event: string, data: Record<string, unknown>): string | null {
  const issueKey = data.issueKey as string | undefined;

  switch (event) {
    case 'issue.created':
      return `${issueKey ?? 'An issue'} was created: ${data.summary ?? ''}`;
    case 'issue.updated':
      return `${issueKey ?? 'An issue'} was updated`;
    case 'issue.assigned':
      return `${issueKey ?? 'An issue'} was reassigned`;
    case 'issue.moved':
    case 'issue.status_changed':
      return `${issueKey ?? 'An issue'} changed status`;
    case 'issue.deleted':
      return `${issueKey ?? 'An issue'} was deleted`;
    case 'comment.created':
      return `New comment on ${issueKey ?? 'an issue'}`;
    case 'project.created':
      return `New project created: ${data.name ?? data.projectKey ?? ''}`;
    default:
      return null;
  }
}

/** Minimal toast display without requiring a toast library */
function showToast(message: string) {
  const container = document.getElementById('ws-toast-container') ?? createToastContainer();
  const toast = document.createElement('div');
  toast.className = 'ws-toast';
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
  container.style.cssText =
    'position:fixed;bottom:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
  document.body.appendChild(container);

  // Inject toast styles once
  const style = document.createElement('style');
  style.textContent = `
    .ws-toast {
      background: hsl(var(--background, 0 0% 100%));
      color: hsl(var(--foreground, 0 0% 3.9%));
      border: 1px solid hsl(var(--border, 0 0% 89.8%));
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      pointer-events: auto;
      transition: opacity 0.3s, transform 0.3s;
      max-width: 360px;
    }
  `;
  document.head.appendChild(style);

  return container;
}

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
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
      const eventUserId = data.userId as string | undefined;
      if (eventUserId && currentUserId && eventUserId !== currentUserId) {
        const message = buildToastMessage(event, data);
        if (message) {
          showToast(message);
        }
      }
    },
    [queryClient, currentUserId],
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    // Derive WebSocket URL from API base URL (socket.io handles ws:// upgrade)
    const wsUrl = API_BASE_URL.replace('/api/v1', '');

    const socket = io(`${wsUrl}/ws`, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    // Listen for all domain events the server emits
    const domainEvents = [
      'issue.created',
      'issue.updated',
      'issue.assigned',
      'issue.moved',
      'issue.status_changed',
      'issue.deleted',
      'comment.created',
      'comment.deleted',
      'project.created',
      'project.updated',
      'checklist.item_added',
      'checklist.item_completed',
      'checklist.item_removed',
    ];

    for (const event of domainEvents) {
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
  }, [accessToken, handleEvent]);

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
