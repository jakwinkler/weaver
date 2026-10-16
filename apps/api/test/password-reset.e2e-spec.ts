import { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserEntity } from '@weaver/db';
import type { AccountEmailJobData } from '@weaver/shared';
import { createHash, randomBytes } from 'crypto';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/core/auth/auth.service';
import { PasswordResetService } from '../src/core/auth/password-reset.service';
import { RateLimitingGuard } from '../src/core/rate-limiting';
import { TenantConnectionProvider } from '../src/core/tenant';
import { AccountMailQueueService } from '../src/modules/mail/account-mail-queue.service';
import { MailService } from '../src/modules/mail/mail.service';
import { UsersService } from '../src/modules/users/users.service';
import { holdFirstTouch } from './user-row-hold';

jest.setTimeout(60_000);

const GENERIC_REPLY = {
  message: 'If an account uses that email address, we sent it a link to reset the password.',
};
const INVALID_LINK = 'This reset link is invalid or has expired. Request a new one.';

class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];
  log(message: unknown) {
    this.lines.push(String(message));
  }
  error(message: unknown, ...rest: unknown[]) {
    this.lines.push([message, ...rest].map(String).join(' '));
  }
  warn(message: unknown) {
    this.lines.push(String(message));
  }
  debug(message: unknown) {
    this.lines.push(String(message));
  }
  verbose(message: unknown) {
    this.lines.push(String(message));
  }
}

describe('Password reset (e2e)', () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const slug = `reset-test-${suffix}`;
  const schema = `tenant_${slug.replace(/-/g, '_')}`;
  const ownerEmail = `reset-owner-${suffix}@example.invalid`;
  const ssoEmail = `reset-sso-${suffix}@example.invalid`;
  const unknownEmail = `reset-nobody-${suffix}@example.invalid`;
  const jobs: AccountEmailJobData[] = [];
  const logger = new CapturingLogger();
  const issuedTokens: string[] = [];
  const savedEnv = { host: process.env.SMTP_HOST, from: process.env.SMTP_FROM };

  let app: INestApplication;
  let dataSource: DataSource;
  let connections: TenantConnectionProvider;
  let passwordReset: PasswordResetService;
  let tenantId: string;
  let ownerId: string;
  let ssoUserId: string;
  let password = 'original-password-1';

  const http = () => request(app.getHttpServer());

  function connectSocket(token: string): Socket {
    const { port } = app.getHttpServer().address();
    return io(`http://127.0.0.1:${port}/ws`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
  }

  /** Resolves true when the gateway keeps the socket for the whole window. */
  function staysConnected(socket: Socket, windowMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
      let connected = false;
      const timer = setTimeout(() => resolve(connected), windowMs);
      socket.on('connect', () => {
        connected = true;
      });
      for (const event of ['disconnect', 'connect_error']) {
        socket.on(event, () => {
          clearTimeout(timer);
          resolve(false);
        });
      }
    });
  }

  function signedIn(token: string, path: string) {
    return http().get(path).set('Authorization', `Bearer ${token}`).set('X-Tenant-ID', tenantId);
  }

  async function resetRateLimits() {
    const guard = app.get(RateLimitingGuard) as any;
    if (guard.touchedKeys.size) await guard.redis.del(...guard.touchedKeys);
    guard.touchedKeys.clear();
  }

  async function requestLink(email: string) {
    const response = await http()
      .post('/api/v1/auth/password-reset/request')
      .send({ email })
      .expect(202);
    expect(response.body).toEqual(GENERIC_REPLY);
    await passwordReset.settle();
    return response;
  }

  function latestToken(to: string): string {
    const job = [...jobs]
      .reverse()
      .find((item) => item.to === to && item.template === 'password-reset');
    const token = job?.body.match(/\/reset-password\/([a-f0-9]{96})/)?.[1];
    if (!token) throw new Error(`No reset link was sent to ${to}`);
    issuedTokens.push(token);
    return token;
  }

  beforeAll(async () => {
    process.env.SMTP_HOST = 'smtp.example.invalid';
    process.env.SMTP_FROM = 'weaver@example.invalid';
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AccountMailQueueService)
      .useValue({
        enqueue: jest.fn(async (job: AccountEmailJobData) => {
          jobs.push(job);
        }),
      })
      .compile();
    app = moduleFixture.createNestApplication();
    app.useLogger(logger);
    app.setGlobalPrefix('api/v1');
    await app.init();
    // Sockets need a listening server.
    await app.listen(0);
    dataSource = app.get(DataSource);
    connections = app.get(TenantConnectionProvider);
    passwordReset = app.get(PasswordResetService);

    const registration = await http()
      .post('/api/v1/auth/register')
      .send({
        email: ownerEmail,
        password,
        displayName: 'Reset Owner',
        orgName: 'Reset Test',
        orgSlug: slug,
      })
      .expect(201);
    tenantId = registration.body.tenantId;
    ownerId = registration.body.user.id;

    const [ssoUser] = await dataSource.query(
      `INSERT INTO public.users (email, display_name, password_hash, auth_provider, auth_providers)
       VALUES ($1, 'SSO Only', NULL, 'google', 'google') RETURNING id`,
      [ssoEmail],
    );
    ssoUserId = ssoUser.id;
  });

  beforeEach(async () => {
    await resetRateLimits();
  });

  afterAll(async () => {
    await resetRateLimits();
    if (tenantId) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    }
    await dataSource.query('DELETE FROM public.users WHERE email = ANY($1)', [
      [ownerEmail, ssoEmail],
    ]);
    await connections.closeAll();
    await app.close();
    process.env.SMTP_HOST = savedEnv.host;
    process.env.SMTP_FROM = savedEnv.from;
    if (savedEnv.host === undefined) delete process.env.SMTP_HOST;
    if (savedEnv.from === undefined) delete process.env.SMTP_FROM;
  });

  it('answers identically, before any account lookup, for existing, unknown, and SSO-only addresses', async () => {
    const service = passwordReset as any;
    const lookup = service.findUserByEmail.bind(service);
    const lookupSpy = jest.spyOn(service, 'findUserByEmail').mockImplementation(async (email) => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      return lookup(email);
    });
    jobs.length = 0;

    const replies = [];
    for (const email of [ownerEmail.toUpperCase(), unknownEmail, ssoEmail]) {
      const started = Date.now();
      const reply = await http().post('/api/v1/auth/password-reset/request').send({ email });
      replies.push({ status: reply.status, body: reply.body, elapsed: Date.now() - started });
    }
    await passwordReset.settle();
    lookupSpy.mockRestore();

    for (const reply of replies) {
      expect(reply).toEqual({ status: 202, body: GENERIC_REPLY, elapsed: expect.any(Number) });
      // The reply never waits for the 750 ms account lookup.
      expect(reply.elapsed).toBeLessThan(500);
    }
    expect(jobs.map((job) => [job.to, job.template])).toEqual([
      [ownerEmail, 'password-reset'],
      [ssoEmail, 'password-reset-unavailable'],
    ]);
    expect(jobs[1].body).toContain('signs in with Google');
    expect(jobs[1].body).not.toMatch(/reset-password\//);
    latestToken(ownerEmail);
  });

  it('stores only a verifier hash, and a newer request cancels the earlier link', async () => {
    await requestLink(ownerEmail);
    const first = latestToken(ownerEmail);
    await requestLink(ownerEmail);
    const second = latestToken(ownerEmail);
    expect(second).not.toBe(first);

    const rows = await dataSource.query(
      'SELECT selector, verifier_hash, expires_at FROM public.password_reset_tokens WHERE user_id = $1',
      [ownerId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].selector).toBe(second.slice(0, 32));
    expect(rows[0].verifier_hash).toBe(createHash('sha256').update(second.slice(32)).digest('hex'));
    expect(JSON.stringify(rows)).not.toContain(second.slice(32));
    const lifetime = new Date(rows[0].expires_at).getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(29 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(30 * 60_000);

    const stale = await http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: first, password: 'unused-password-1' })
      .expect(400);
    expect(stale.body.message).toBe(INVALID_LINK);
  });

  it('applies the registration password rules', async () => {
    await requestLink(ownerEmail);
    const token = latestToken(ownerEmail);
    for (const candidate of ['short', 'x'.repeat(129)]) {
      await http()
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, password: candidate })
        .expect(400);
    }
    const [{ count }] = await dataSource.query(
      'SELECT count(*)::int AS count FROM public.password_reset_tokens WHERE user_id = $1',
      [ownerId],
    );
    expect(count).toBe(1);
  });

  it('rejects an expired link', async () => {
    await requestLink(ownerEmail);
    const token = latestToken(ownerEmail);
    await dataSource.query(
      `UPDATE public.password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE selector = $1`,
      [token.slice(0, 32)],
    );
    const response = await http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'expired-password-1' })
      .expect(400);
    expect(response.body.message).toBe(INVALID_LINK);
  });

  it('changes the password once, signs out every session, emails the owner, and audits it', async () => {
    const signIn = await http()
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password })
      .expect(201);
    const oldRefresh = signIn.body.refreshToken;
    const [{ count: sessionsBefore }] = await dataSource.query(
      'SELECT count(*)::int AS count FROM public.refresh_sessions WHERE user_id = $1',
      [ownerId],
    );
    expect(sessionsBefore).toBeGreaterThanOrEqual(2);

    await requestLink(ownerEmail);
    const token = latestToken(ownerEmail);
    const newPassword = 'changed-password-2';
    const confirmed = await http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: newPassword })
      .expect(200);
    expect(confirmed.body.message).toBe(
      'Your password was changed. Sign in with your new password.',
    );
    const cleared = ([] as string[]).concat(confirmed.headers['set-cookie'] ?? []);
    expect(cleared.some((cookie) => cookie.startsWith('weaver_token=;'))).toBe(true);
    expect(cleared.some((cookie) => cookie.startsWith('weaver_refresh=;'))).toBe(true);

    const replay = await http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'replayed-password-3' })
      .expect(400);
    expect(replay.body.message).toBe(INVALID_LINK);

    const [{ count: sessionsAfter }] = await dataSource.query(
      'SELECT count(*)::int AS count FROM public.refresh_sessions WHERE user_id = $1',
      [ownerId],
    );
    expect(sessionsAfter).toBe(0);
    await http()
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${oldRefresh}`)
      .expect(401);
    await http().post('/api/v1/auth/login').send({ email: ownerEmail, password }).expect(401);
    password = newPassword;
    const fresh = await http()
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password })
      .expect(201);

    const changed = jobs.filter(
      (job) => job.to === ownerEmail && job.template === 'password-changed',
    );
    expect(changed).toHaveLength(1);
    expect(changed[0].body).toContain('/forgot-password');
    expect(changed[0].body).not.toContain(token);

    const audit = await http()
      .get('/api/v1/audit-log')
      .query({ action: 'user.password_reset' })
      .set('Authorization', `Bearer ${fresh.body.accessToken}`)
      .set('X-Tenant-ID', tenantId)
      .expect(200);
    expect(audit.body.data).toHaveLength(1);
    expect(audit.body.data[0]).toMatchObject({
      userId: ownerId,
      action: 'user.password_reset',
      resource: 'user',
      resourceId: ownerId,
      metadata: { method: 'email_link', revokedSessions: sessionsBefore },
    });
  });

  it('ends signed-in sessions at once: API routes, /auth/me, /auth/session, and sockets', async () => {
    const before = await http()
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password })
      .expect(201);
    const oldAccess: string = before.body.accessToken;
    await http()
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${oldAccess}`)
      .set('X-Tenant-ID', tenantId)
      .send({ key: 'RST', name: 'Reset sessions' })
      .expect(201);
    await signedIn(oldAccess, '/api/v1/projects').expect(200);
    await signedIn(oldAccess, '/api/v1/auth/me').expect(200);

    const openSocket = connectSocket(oldAccess);
    expect(await staysConnected(openSocket, 1000)).toBe(true);
    await expect(
      openSocket.timeout(3000).emitWithAck('join:project', { projectKey: 'RST' }),
    ).resolves.toEqual({ joined: true, projectKey: 'RST' });
    const ended = new Promise<string>((resolve) => openSocket.on('disconnect', resolve));

    await requestLink(ownerEmail);
    const token = latestToken(ownerEmail);
    const newPassword = 'session-ending-password-3';
    await http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: newPassword })
      .expect(200);
    password = newPassword;

    // The open socket is closed by the server, not left to expire.
    await expect(ended).resolves.toBe('io server disconnect');
    openSocket.close();

    // The access token is still inside its 15 minutes but no longer works anywhere.
    await signedIn(oldAccess, '/api/v1/projects').expect(401);
    await http()
      .get('/api/v1/projects')
      .set('Cookie', `weaver_token=${oldAccess}`)
      .set('X-Tenant-ID', tenantId)
      .expect(401);
    await signedIn(oldAccess, '/api/v1/auth/me').expect(401);
    await signedIn(oldAccess, '/api/v1/auth/session').expect(401);
    const lateSocket = connectSocket(oldAccess);
    // Depending on timing the join is answered "not joined" or not answered before the drop.
    const lateJoin = lateSocket
      .timeout(1000)
      .emitWithAck('join:project', { projectKey: 'RST' })
      .then(
        (ack: { joined?: boolean }) => (ack?.joined ? 'joined' : 'refused'),
        () => 'refused',
      );
    expect(await staysConnected(lateSocket)).toBe(false);
    await expect(lateJoin).resolves.toBe('refused');
    lateSocket.close();

    const after = await http()
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password })
      .expect(201);
    const newAccess: string = after.body.accessToken;
    expect(after.body.user).not.toHaveProperty('sessionVersion');
    await signedIn(newAccess, '/api/v1/projects').expect(200);
    const me = await signedIn(newAccess, '/api/v1/auth/me').expect(200);
    expect(me.body).not.toHaveProperty('sessionVersion');
    await signedIn(newAccess, '/api/v1/auth/session').expect(200);
    const freshSocket = connectSocket(newAccess);
    expect(await staysConnected(freshSocket, 1000)).toBe(true);
    await expect(
      freshSocket.timeout(3000).emitWithAck('join:project', { projectKey: 'RST' }),
    ).resolves.toEqual({ joined: true, projectKey: 'RST' });
    freshSocket.close();

    // Refreshing the new session issues tokens that keep working.
    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${after.body.refreshToken}`)
      .expect(201);
    await signedIn(refreshed.body.accessToken, '/api/v1/projects').expect(200);
  });

  it('does not let a sign-in that raced a reset keep its session', async () => {
    const raced = await http()
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password })
      .expect(201);
    // The sign-in checked the old password and wrote its session row after the reset's
    // cleanup; only the version moved.
    await dataSource.query(
      'UPDATE public.users SET session_version = session_version + 1 WHERE id = $1',
      [ownerId],
    );
    await signedIn(raced.body.accessToken, '/api/v1/projects').expect(401);
    await http()
      .post('/api/v1/auth/refresh')
      .set('Authorization', `Bearer ${raced.body.refreshToken}`)
      .expect(401);
    await http().post('/api/v1/auth/login').send({ email: ownerEmail, password }).expect(201);
  });

  describe('a user change that spans the reset', () => {
    let resets = 0;

    function userRepoOf(service: object): Repository<UserEntity> {
      return (service as { userRepo: Repository<UserEntity> }).userRepo;
    }

    async function ownerSession() {
      const signIn = await http()
        .post('/api/v1/auth/login')
        .send({ email: ownerEmail, password })
        .expect(201);
      return signIn.body.accessToken as string;
    }

    /**
     * Starts `run`, holds it at its first touch of the owner's row through `repo` (just after
     * it loads the row, or just before it writes it), resets the password, then lets it finish.
     */
    async function resetWhileHeld(repo: Repository<UserEntity>, run: () => Promise<unknown>) {
      const hold = holdFirstTouch(repo, ownerId);

      try {
        const outcome = run();
        await Promise.race([
          hold.reached,
          outcome.then(() => {
            throw new Error('finished without touching the account');
          }),
        ]);
        const [{ password_hash: loadedHash }] = await dataSource.query(
          'SELECT password_hash FROM public.users WHERE id = $1',
          [ownerId],
        );

        await requestLink(ownerEmail);
        const token = latestToken(ownerEmail);
        const oldPassword = password;
        resets += 1;
        password = `stale-save-password-${resets}`;
        await http()
          .post('/api/v1/auth/password-reset/confirm')
          .send({ token, password })
          .expect(200);
        const [{ password_hash: resetHash }] = await dataSource.query(
          'SELECT password_hash FROM public.users WHERE id = $1',
          [ownerId],
        );
        expect(resetHash).not.toBe(loadedHash);

        hold.release();
        await outcome;

        const [{ password_hash: finalHash }] = await dataSource.query(
          'SELECT password_hash FROM public.users WHERE id = $1',
          [ownerId],
        );
        expect(finalHash).toBe(resetHash);
        await http()
          .post('/api/v1/auth/login')
          .send({ email: ownerEmail, password: oldPassword })
          .expect(401);
        await http().post('/api/v1/auth/login').send({ email: ownerEmail, password }).expect(201);
      } finally {
        hold.restore();
      }
    }

    async function ownerRow() {
      const [row] = await dataSource.query(
        'SELECT display_name, notification_preferences, auth_providers FROM public.users WHERE id = $1',
        [ownerId],
      );
      return row;
    }

    it('keeps the new password when a profile update saves', async () => {
      const access = await ownerSession();
      await resetWhileHeld(userRepoOf(app.get(UsersService)), () =>
        http()
          .patch('/api/v1/users/me')
          .set('Authorization', `Bearer ${access}`)
          .set('X-Tenant-ID', tenantId)
          .send({ displayName: 'Renamed During Reset' })
          .expect(200)
          .then(),
      );
      expect((await ownerRow()).display_name).toBe('Renamed During Reset');
    });

    it('keeps the new password when notification preferences save', async () => {
      const access = await ownerSession();
      await resetWhileHeld(userRepoOf(app.get(UsersService)), () =>
        http()
          .patch('/api/v1/users/me/notification-preferences')
          .set('Authorization', `Bearer ${access}`)
          .set('X-Tenant-ID', tenantId)
          .send({ emailOnComment: false })
          .expect(200)
          .then(),
      );
      expect((await ownerRow()).notification_preferences.emailOnComment).toBe(false);
    });

    it('keeps the new password when an email unsubscribe link saves', async () => {
      const mail = app.get(MailService);
      const unsubscribe = mail.createUnsubscribeToken(ownerId, 'emailOnMention');
      await resetWhileHeld(userRepoOf(mail), () =>
        http()
          .post('/api/v1/notifications/unsubscribe')
          .send({ token: unsubscribe })
          .expect(201)
          .then(),
      );
      expect((await ownerRow()).notification_preferences.emailOnMention).toBe(false);
    });

    it('keeps the new password when a social sign-in links a provider', async () => {
      const auth = app.get(AuthService);
      await resetWhileHeld(userRepoOf(auth), () =>
        auth.completeOAuth({
          provider: 'github',
          email: ownerEmail,
          displayName: 'Reset Owner',
          avatarUrl: null,
        }),
      );
      expect((await ownerRow()).auth_providers).toContain('github');
    });

    it('keeps the new password when a social sign-in has nothing new to save', async () => {
      const auth = app.get(AuthService);
      await resetWhileHeld(userRepoOf(auth), () =>
        auth.completeOAuth({
          provider: 'github',
          email: ownerEmail,
          displayName: 'Reset Owner',
          avatarUrl: null,
        }),
      );
    });
  });

  it('never adds a password to an SSO-only account', async () => {
    await requestLink(ssoEmail);
    const rows = await dataSource.query(
      'SELECT id FROM public.password_reset_tokens WHERE user_id = $1',
      [ssoUserId],
    );
    expect(rows).toHaveLength(0);

    // Even a planted token cannot set one.
    const selector = randomBytes(16).toString('hex');
    const verifier = randomBytes(32).toString('hex');
    await dataSource.query(
      `INSERT INTO public.password_reset_tokens (user_id, selector, verifier_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '10 minutes')`,
      [ssoUserId, selector, createHash('sha256').update(verifier).digest('hex')],
    );
    await http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: `${selector}${verifier}`, password: 'planted-password-1' })
      .expect(400);
    const [user] = await dataSource.query('SELECT password_hash FROM public.users WHERE id = $1', [
      ssoUserId,
    ]);
    expect(user.password_hash).toBeNull();
    await dataSource.query('DELETE FROM public.password_reset_tokens WHERE user_id = $1', [
      ssoUserId,
    ]);
  });

  it('throttles requests per client address and per email address', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await http()
        .post('/api/v1/auth/password-reset/request')
        .send({ email: unknownEmail })
        .expect(202);
    }
    const limited = await http()
      .post('/api/v1/auth/password-reset/request')
      .send({ email: unknownEmail })
      .expect(429);
    expect(limited.body.retryAfter).toBeGreaterThan(60);
    await passwordReset.settle();
  });

  it('throttles confirm attempts per account, separately from the client address budget', async () => {
    await requestLink(ownerEmail);
    const token = latestToken(ownerEmail);
    const wrong = `${token.slice(0, 32)}${'0'.repeat(64)}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await http()
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: wrong, password: 'guessing-password-1' })
        .expect(400);
    }
    // The client address allows 10 per window; the sixth try against one account is refused.
    await http()
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'guessing-password-1' })
      .expect(429);
    await http().post('/api/v1/auth/login').send({ email: ownerEmail, password }).expect(201);
  });

  it('never writes a reset token to the application log', () => {
    expect(issuedTokens.length).toBeGreaterThan(3);
    const output = logger.lines.join('\n');
    for (const token of issuedTokens) {
      expect(output).not.toContain(token.slice(32));
    }
    expect(output).toContain(`Password reset completed for user ${ownerId}`);
    expect(output).not.toContain(ownerEmail);
  });
});
