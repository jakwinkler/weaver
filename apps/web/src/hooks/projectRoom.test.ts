import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROJECT_JOIN_DELAY_MS,
  PROJECT_JOIN_LIMIT,
  PROJECT_JOIN_RETRY_DELAYS_MS,
  PROJECT_JOIN_WINDOW_MS,
  ProjectRoomSubscription,
  getProjectKeyForPath,
  type ProjectRoomSocket,
} from './projectRoom';

type Ack = (error: Error | null, result?: { joined: boolean; projectKey?: string }) => void;

class FakeSocket implements ProjectRoomSocket {
  connected = false;
  sent: string[] = [];
  pendingJoins: { projectKey: string; ack: Ack }[] = [];
  private listeners = new Map<string, Set<() => void>>();

  on(event: string, listener: () => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: () => void) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: { projectKey: string }) {
    this.sent.push(`${event} ${payload.projectKey}`);
  }

  timeout() {
    return {
      emit: (event: string, payload: { projectKey: string }, ack: Ack) => {
        this.sent.push(`${event} ${payload.projectKey}`);
        this.pendingJoins.push({ projectKey: payload.projectKey, ack });
      },
    };
  }

  connect() {
    this.connected = true;
    this.listeners.get('connect')?.forEach((listener) => listener());
  }

  disconnect() {
    this.connected = false;
    this.listeners.get('disconnect')?.forEach((listener) => listener());
  }

  answer(joined = true) {
    const join = this.pendingJoins.shift();
    if (!join) throw new Error('No join is waiting for an answer');
    join.ack(null, { joined, ...(joined ? { projectKey: join.projectKey } : {}) });
  }

  takeSent() {
    const sent = this.sent;
    this.sent = [];
    return sent;
  }
}

describe('getProjectKeyForPath', () => {
  it.each([
    ['/projects/WEB', 'WEB'],
    ['/projects/WEB/board', 'WEB'],
    ['/projects/WEB/backlog', 'WEB'],
    ['/projects/WEB/sprints', 'WEB'],
    ['/projects/WEB/roadmap', 'WEB'],
    ['/projects/WEB/issues', 'WEB'],
    ['/projects/WEB/settings', 'WEB'],
    ['/projects/WEB2/reports/sprint/abc', 'WEB2'],
    ['/issues/WEB-12', 'WEB'],
    ['/issues/OPS9-3', 'OPS9'],
  ])('maps %s to %s', (pathname, projectKey) => {
    expect(getProjectKeyForPath(pathname)).toBe(projectKey);
  });

  it.each(['/', '/projects', '/projects/', '/projects/web', '/issues/WEB', '/issues/web-1', '/search', '/admin/users'])(
    'has no project room for %s',
    (pathname) => {
      expect(getProjectKeyForPath(pathname)).toBeNull();
    },
  );
});

describe('ProjectRoomSubscription', () => {
  let socket: FakeSocket;
  let rooms: ProjectRoomSubscription;

  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
    rooms = new ProjectRoomSubscription(socket);
  });

  afterEach(() => {
    rooms.dispose();
    vi.useRealTimers();
  });

  function settle(ms = PROJECT_JOIN_DELAY_MS) {
    vi.advanceTimersByTime(ms);
  }

  it('joins the route project after navigation settles', () => {
    socket.connect();
    rooms.setProject('WEB');

    settle(PROJECT_JOIN_DELAY_MS - 1);
    expect(socket.sent).toEqual([]);
    settle(1);
    expect(socket.takeSent()).toEqual(['join:project WEB']);
  });

  it('waits for the connection instead of buffering a join', () => {
    rooms.setProject('WEB');
    settle();
    expect(socket.sent).toEqual([]);

    socket.connect();
    expect(socket.sent).toEqual([]);
    settle();
    expect(socket.takeSent()).toEqual(['join:project WEB']);
  });

  it('stays in the room while the route stays in the same project', () => {
    socket.connect();
    rooms.setProject('WEB');
    settle();
    socket.answer();
    socket.takeSent();

    rooms.setProject('WEB');
    settle();
    expect(socket.sent).toEqual([]);
  });

  it('leaves the previous project at once and joins the next one after it settles', () => {
    socket.connect();
    rooms.setProject('WEB');
    settle();
    socket.answer();
    socket.takeSent();

    rooms.setProject('OPS');
    expect(socket.takeSent()).toEqual(['leave:project WEB']);
    settle();
    expect(socket.takeSent()).toEqual(['join:project OPS']);
  });

  it('leaves the room for routes outside a project', () => {
    socket.connect();
    rooms.setProject('WEB');
    settle();
    socket.answer();
    socket.takeSent();

    rooms.setProject(null);
    settle();
    expect(socket.takeSent()).toEqual(['leave:project WEB']);
  });

  it('spends no joins on projects the user only passes through', () => {
    socket.connect();
    rooms.setProject('ONE');
    settle(100);
    rooms.setProject('TWO');
    settle(100);
    rooms.setProject('THREE');
    settle();

    expect(socket.takeSent()).toEqual(['join:project THREE']);
  });

  it('leaves a room only after its join is confirmed', () => {
    socket.connect();
    rooms.setProject('WEB');
    settle();
    socket.takeSent();

    rooms.setProject('OPS');
    settle();
    expect(socket.sent).toEqual([]);

    socket.answer();
    expect(socket.takeSent()).toEqual(['leave:project WEB', 'join:project OPS']);
  });

  it('rejoins the current project after a reconnect', () => {
    socket.connect();
    rooms.setProject('WEB');
    settle();
    socket.answer();
    socket.takeSent();

    socket.disconnect();
    rooms.setProject('OPS');
    settle();
    expect(socket.sent).toEqual([]);

    socket.connect();
    settle();
    expect(socket.takeSent()).toEqual(['join:project OPS']);
  });

  it('ignores join answers from a previous connection', () => {
    socket.connect();
    rooms.setProject('WEB');
    settle();
    const staleJoin = socket.pendingJoins.shift()!;
    socket.takeSent();
    socket.disconnect();
    socket.connect();
    settle();
    expect(socket.takeSent()).toEqual(['join:project WEB']);

    staleJoin.ack(new Error('socket has been disconnected'));
    vi.advanceTimersByTime(10 * 60_000);
    expect(socket.sent).toEqual([]);

    socket.answer();
    rooms.setProject(null);
    expect(socket.takeSent()).toEqual(['leave:project WEB']);
  });

  it('retries a refused join with backoff and then gives up', () => {
    socket.connect();
    rooms.setProject('WEB');
    settle();
    socket.takeSent();

    for (const delay of PROJECT_JOIN_RETRY_DELAYS_MS) {
      socket.answer(false);
      vi.advanceTimersByTime(delay - 1);
      expect(socket.sent).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(socket.takeSent()).toEqual(['join:project WEB']);
    }

    socket.answer(false);
    vi.advanceTimersByTime(10 * 60_000);
    expect(socket.sent).toEqual([]);
  });

  it('retries a join the gateway never answers', () => {
    socket.connect();
    rooms.setProject('WEB');
    settle();
    socket.takeSent();

    socket.pendingJoins.shift()!.ack(new Error('operation has timed out'));
    vi.advanceTimersByTime(PROJECT_JOIN_RETRY_DELAYS_MS[0]);
    expect(socket.takeSent()).toEqual(['join:project WEB']);
  });

  it('keeps joins within the gateway limit for one connection window', () => {
    socket.connect();
    const projects = Array.from({ length: PROJECT_JOIN_LIMIT + 1 }, (_, index) => `P${index}`);
    for (const projectKey of projects) {
      rooms.setProject(projectKey);
      settle();
      if (socket.pendingJoins.length > 0) socket.answer();
    }

    const joins = socket.takeSent().filter((message) => message.startsWith('join:project'));
    expect(joins).toHaveLength(PROJECT_JOIN_LIMIT);
    expect(joins.at(-1)).toBe(`join:project P${PROJECT_JOIN_LIMIT - 1}`);

    const elapsed = PROJECT_JOIN_LIMIT * PROJECT_JOIN_DELAY_MS;
    vi.advanceTimersByTime(PROJECT_JOIN_WINDOW_MS - elapsed);
    expect(socket.takeSent()).toEqual([`join:project P${PROJECT_JOIN_LIMIT}`]);
  });

  it('starts a fresh join window on each connection', () => {
    socket.connect();
    for (let index = 0; index < PROJECT_JOIN_LIMIT; index += 1) {
      rooms.setProject(`P${index}`);
      settle();
      socket.answer();
    }
    socket.disconnect();
    socket.takeSent();

    socket.connect();
    settle();
    expect(socket.takeSent()).toEqual([`join:project P${PROJECT_JOIN_LIMIT - 1}`]);
  });

  it('stops reacting to the socket once disposed', () => {
    rooms.setProject('WEB');
    rooms.dispose();
    socket.connect();
    settle();

    expect(socket.sent).toEqual([]);
  });
});
