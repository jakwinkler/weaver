// Same patterns as @weaver/shared, whose CommonJS build the web app imports only for types.
const PROJECT_KEY_REGEX = /^[A-Z][A-Z0-9]{1,9}$/;
const ISSUE_KEY_REGEX = /^[A-Z][A-Z0-9]{1,9}-\d+$/;

/** Wait for navigation to settle so pages the user only passes through spend no joins. */
export const PROJECT_JOIN_DELAY_MS = 300;
/** Mirrors the gateway's per-connection limit of 20 joins per 10 second window. */
export const PROJECT_JOIN_LIMIT = 20;
export const PROJECT_JOIN_WINDOW_MS = 10_000;
/**
 * The gateway answers `joined: false` alike for a socket it has not finished
 * authenticating, throttling, an unavailable rate-limit store, and missing
 * project access, so refused joins retry a few times.
 */
export const PROJECT_JOIN_RETRY_DELAYS_MS = [1_000, 10_000, 30_000, 60_000];
const PROJECT_JOIN_ACK_TIMEOUT_MS = 10_000;

interface ProjectJoinAck {
  joined: boolean;
  projectKey?: string;
}

/** The part of a socket.io client socket that project rooms need. */
export interface ProjectRoomSocket {
  readonly connected: boolean;
  on(event: 'connect' | 'disconnect', listener: () => void): unknown;
  off(event: 'connect' | 'disconnect', listener: () => void): unknown;
  emit(event: 'leave:project', payload: { projectKey: string }): unknown;
  timeout(ms: number): {
    emit(
      event: 'join:project',
      payload: { projectKey: string },
      ack: (error: Error | null, result?: ProjectJoinAck) => void,
    ): unknown;
  };
}

/** Project whose events the route shows, or null outside project-scoped routes. */
export function getProjectKeyForPath(pathname: string): string | null {
  const [, section, key] = pathname.split('/');
  if (!key) return null;
  if (section === 'projects') return PROJECT_KEY_REGEX.test(key) ? key : null;
  if (section === 'issues' && ISSUE_KEY_REGEX.test(key)) return key.slice(0, key.lastIndexOf('-'));
  return null;
}

/**
 * Keeps a socket in the room of the project the user is viewing. The gateway
 * sends project events only to sockets that joined that project's room, and a
 * reconnect starts a new server-side socket with no rooms.
 */
export class ProjectRoomSubscription {
  private desired: string | null = null;
  private joined: string | null = null;
  private joining: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private joinTimes: number[] = [];
  private connection = 0;

  constructor(private readonly socket: ProjectRoomSocket) {
    socket.on('connect', this.handleConnect);
    socket.on('disconnect', this.handleDisconnect);
  }

  setProject(projectKey: string | null): void {
    if (projectKey === this.desired) return;
    this.desired = projectKey;
    this.failures = 0;
    this.clearTimer();
    this.leaveUnwanted();
    if (projectKey && projectKey !== this.joined && projectKey !== this.joining) {
      this.schedule(PROJECT_JOIN_DELAY_MS);
    }
  }

  dispose(): void {
    this.clearTimer();
    this.socket.off('connect', this.handleConnect);
    this.socket.off('disconnect', this.handleDisconnect);
  }

  private readonly handleConnect = () => {
    // A new server-side socket has no rooms and a fresh join window. The gateway
    // confirms the connection before it finishes authenticating, so wait a moment.
    this.joined = null;
    this.joining = null;
    this.joinTimes = [];
    this.failures = 0;
    this.schedule(PROJECT_JOIN_DELAY_MS);
  };

  private readonly handleDisconnect = () => {
    this.connection += 1;
    this.joined = null;
    this.joining = null;
    this.clearTimer();
  };

  private sync(): void {
    // socket.io buffers emits while offline; the connect handler joins instead.
    if (!this.socket.connected) return;
    this.leaveUnwanted();
    const projectKey = this.desired;
    if (!projectKey || projectKey === this.joined || this.joining || this.timer) return;

    const now = Date.now();
    this.joinTimes = this.joinTimes.filter((time) => now - time < PROJECT_JOIN_WINDOW_MS);
    if (this.joinTimes.length >= PROJECT_JOIN_LIMIT) {
      this.schedule(this.joinTimes[0] + PROJECT_JOIN_WINDOW_MS - now);
      return;
    }
    this.joinTimes.push(now);
    this.joining = projectKey;
    const connection = this.connection;
    this.socket
      .timeout(PROJECT_JOIN_ACK_TIMEOUT_MS)
      .emit('join:project', { projectKey }, (error, result) => {
        if (connection !== this.connection) return;
        this.joining = null;
        if (!error && result?.joined) {
          this.joined = projectKey;
        } else if (projectKey === this.desired) {
          const delay = PROJECT_JOIN_RETRY_DELAYS_MS[this.failures];
          this.failures += 1;
          if (delay !== undefined) this.schedule(delay);
          return;
        }
        // The route may have changed while the join was in flight.
        this.sync();
      });
  }

  /** Leave only confirmed rooms: the gateway may still finish a join sent earlier. */
  private leaveUnwanted(): void {
    if (!this.joined || this.joined === this.desired || !this.socket.connected) return;
    this.socket.emit('leave:project', { projectKey: this.joined });
    this.joined = null;
  }

  private schedule(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.sync();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
