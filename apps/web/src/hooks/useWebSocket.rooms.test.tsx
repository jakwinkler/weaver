// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores';
import { PROJECT_JOIN_DELAY_MS } from './projectRoom';
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
