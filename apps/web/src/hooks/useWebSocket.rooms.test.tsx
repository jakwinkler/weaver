// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores';
import { PROJECT_JOIN_DELAY_MS } from './projectRoom';
import { INVALIDATION_BATCH_MS } from './websocketEvents';
import { useWebSocket } from './useWebSocket';

const fake = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  type Ack = (error: Error | null, result?: { joined: boolean; projectKey?: string }) => void;

  class HookSocket {
    connected = false;
    closed = false;
    id = 'socket-id';
    sent: string[] = [];
    pendingJoins: Ack[] = [];
    private listeners = new Map<string, Set<Listener>>();

    on(event: string, listener: Listener) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(listener);
      return this;
    }

    off(event: string, listener: Listener) {
      this.listeners.get(event)?.delete(listener);
      return this;
    }

    removeAllListeners() {
      this.listeners.clear();
      return this;
    }

    emit(event: string, payload: { projectKey: string }) {
      this.sent.push(`${event} ${payload.projectKey}`);
      return this;
    }

    timeout() {
      return {
        emit: (event: string, payload: { projectKey: string }, ack: Ack) => {
          this.sent.push(`${event} ${payload.projectKey}`);
          this.pendingJoins.push(ack);
        },
      };
    }

    disconnect() {
      this.closed = true;
      this.connected = false;
      return this;
    }

    connect() {
      this.connected = true;
      this.listeners.get('connect')?.forEach((listener) => listener());
    }

    answer() {
      this.pendingJoins.shift()?.(null, { joined: true });
    }

    receive(event: string, payload: unknown) {
      this.listeners.get(event)?.forEach((listener) => listener(payload));
    }
  }

  return { HookSocket, sockets: [] as HookSocket[] };
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    const socket = new fake.HookSocket();
    fake.sockets.push(socket);
    return socket;
  }),
}));

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useWebSocket project rooms', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    fake.sockets.length = 0;
    queryClient = new QueryClient();
    useAuthStore.setState({ tenantId: 'tenant-1', user: null });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    useAuthStore.setState({ tenantId: null });
  });

  it('follows the route project and carries it to a new organization socket', () => {
    const { rerender, unmount } = renderHook(
      ({ projectKey }: { projectKey: string | null }) => useWebSocket(projectKey),
      { initialProps: { projectKey: 'WEB' }, wrapper },
    );
    expect(fake.sockets).toHaveLength(1);
    const first = fake.sockets[0];

    act(() => first.connect());
    act(() => vi.advanceTimersByTime(PROJECT_JOIN_DELAY_MS));
    expect(first.sent).toEqual(['join:project WEB']);
    act(() => first.answer());

    rerender({ projectKey: 'OPS' });
    act(() => vi.advanceTimersByTime(PROJECT_JOIN_DELAY_MS));
    expect(first.sent).toEqual(['join:project WEB', 'leave:project WEB', 'join:project OPS']);

    act(() => useAuthStore.setState({ tenantId: 'tenant-2' }));
    expect(first.closed).toBe(true);
    expect(fake.sockets).toHaveLength(2);
    const second = fake.sockets[1];
    act(() => second.connect());
    act(() => vi.advanceTimersByTime(PROJECT_JOIN_DELAY_MS));
    expect(second.sent).toEqual(['join:project OPS']);

    unmount();
    expect(second.closed).toBe(true);
  });

  it('opens no project room outside project routes', () => {
    renderHook(() => useWebSocket(null), { wrapper });
    act(() => fake.sockets[0].connect());
    act(() => vi.advanceTimersByTime(PROJECT_JOIN_DELAY_MS));

    expect(fake.sockets[0].sent).toEqual([]);
  });
});

describe('useWebSocket live updates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    fake.sockets.length = 0;
    queryClient = new QueryClient();
    useAuthStore.setState({ tenantId: 'tenant-1', user: { id: 'current-user' } as never });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    useAuthStore.setState({ tenantId: null, user: null });
    document.getElementById('ws-toast-container')?.remove();
  });

  it('refreshes each query once for a burst of events and shows toasts at once', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(() => useWebSocket('WS'), { wrapper });
    const socket = fake.sockets[0];
    act(() => socket.connect());

    act(() => {
      for (let index = 0; index < 5; index += 1) {
        socket.receive('issue.updated', {
          event: 'issue.updated',
          data: { issueKey: 'WS-1', projectKey: 'WS', userId: 'other-user' },
          timestamp: '2026-10-15T12:00:00.000Z',
        });
      }
    });

    expect(document.getElementById('ws-toast-container')?.children).toHaveLength(5);
    expect(invalidate).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(INVALIDATION_BATCH_MS));

    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['issue', 'WS-1'],
      ['activity', 'WS-1'],
      ['issues'],
      ['boards'],
      ['boardIssues'],
      ['backlog'],
      ['sprintStats'],
      ['dashboard'],
    ]);
  });

  it('refreshes events still waiting in a batch when the socket closes', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = renderHook(() => useWebSocket('WS'), { wrapper });
    const socket = fake.sockets[0];
    act(() => socket.connect());

    act(() =>
      socket.receive('comment.created', {
        event: 'comment.created',
        data: { issueKey: 'WS-1' },
        timestamp: '2026-10-15T12:00:00.000Z',
      }),
    );
    unmount();

    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['comments', 'WS-1'],
      ['activity', 'WS-1'],
    ]);
  });
});
