import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserEntity } from '@weaver/db';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@weaver/shared';
import request from 'supertest';
import { DataSource, FindOneOptions, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService, type OAuthIdentity } from '../src/core/auth/auth.service';
import { TenantConnectionProvider } from '../src/core/tenant';
import { MailService } from '../src/modules/mail/mail.service';
import { UsersService } from '../src/modules/users/users.service';
import { holdFirstTouch } from './user-row-hold';

jest.setTimeout(60_000);

describe('Concurrent changes to one user (e2e)', () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  const slug = `user-writes-${suffix}`;
  const schema = `tenant_${slug.replace(/-/g, '_')}`;
  const ownerEmail = `user-writes-${suffix}@example.invalid`;
  const password = 'concurrent-writes-1';

  let app: INestApplication;
  let dataSource: DataSource;
  let tenantId: string;
  let ownerId: string;
  let access: string;

  const http = () => request(app.getHttpServer());

  function userRepoOf(service: object): Repository<UserEntity> {
    return (service as { userRepo: Repository<UserEntity> }).userRepo;
  }

  function patchProfile(body: object) {
    return http()
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${access}`)
      .set('X-Tenant-ID', tenantId)
      .send(body)
      .expect(200)
      .then((response) => response);
  }

  function patchPreferences(body: object) {
    return http()
      .patch('/api/v1/users/me/notification-preferences')
      .set('Authorization', `Bearer ${access}`)
      .set('X-Tenant-ID', tenantId)
      .send(body)
      .expect(200)
      .then((response) => response);
  }

  function oauthSignIn(provider: OAuthIdentity['provider'], avatarUrl: string | null = null) {
    return app.get(AuthService).completeOAuth({
      provider,
      email: ownerEmail,
      displayName: 'Name From Provider',
      avatarUrl,
    });
  }

  /**
   * Starts `held`, pauses it at its first touch of the owner's row through `repo` (after it
   * reads the row, or before it writes it), runs `other` to completion, then lets `held`
   * finish. A write computed from what `held` read earlier would undo `other`'s change.
   */
  async function interleave<T>(
    repo: Repository<UserEntity>,
    held: () => Promise<T>,
    other: () => Promise<unknown>,
  ): Promise<T> {
    const hold = holdFirstTouch(repo, ownerId);
    try {
      const outcome = held();
      await Promise.race([
        hold.reached,
        outcome.then(() => {
          throw new Error('finished without touching the account');
        }),
      ]);
      await other();
      hold.release();
      return await outcome;
    } finally {
      hold.restore();
    }
  }

  async function ownerRow() {
    const [row] = await dataSource.query(
      `SELECT display_name, avatar_url, auth_providers, notification_preferences
         FROM public.users WHERE id = $1`,
      [ownerId],
    );
    return row;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // Bound to loopback so supertest sends to this app's port and never to another
    // local listener that happens to hold the same port number.
    await app.listen(0, '127.0.0.1');
    dataSource = app.get(DataSource);

    const registration = await http()
      .post('/api/v1/auth/register')
      .send({
        email: ownerEmail,
        password,
        displayName: 'Original Name',
        orgName: 'Concurrent Writes',
        orgSlug: slug,
      })
      .expect(201);
    tenantId = registration.body.tenantId;
    ownerId = registration.body.user.id;
    const signIn = await http()
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password })
      .expect(201);
    access = signIn.body.accessToken;
  });

  beforeEach(async () => {
    await dataSource.query(
      `UPDATE public.users
          SET display_name = 'Original Name', avatar_url = NULL, auth_provider = 'local',
              auth_providers = 'local', notification_preferences = $2::jsonb
        WHERE id = $1`,
      [ownerId, JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCES)],
    );
  });

  afterAll(async () => {
    if (tenantId) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    }
    await dataSource.query('DELETE FROM public.users WHERE email = $1', [ownerEmail]);
    await app.get(TenantConnectionProvider).closeAll();
    await app.close();
  });

  it('keeps a preference change made while a profile rename is in flight', async () => {
    const renamed = await interleave(
      userRepoOf(app.get(UsersService)),
      () => patchProfile({ displayName: 'Renamed' }),
      () => patchPreferences({ emailOnComment: false }),
    );

    const row = await ownerRow();
    expect(row.display_name).toBe('Renamed');
    expect(row.notification_preferences.emailOnComment).toBe(false);
    expect(renamed.body).toMatchObject({
      id: ownerId,
      displayName: 'Renamed',
      notificationPreferences: { emailOnComment: false },
    });
    expect(renamed.body).not.toHaveProperty('passwordHash');
    expect(renamed.body).not.toHaveProperty('sessionVersion');
  });

  it('keeps both of two preference changes made at the same time', async () => {
    const first = await interleave(
      userRepoOf(app.get(UsersService)),
      () => patchPreferences({ emailOnAssign: false }),
      () => patchPreferences({ emailOnComment: false }),
    );

    const expected = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      emailOnAssign: false,
      emailOnComment: false,
    };
    expect((await ownerRow()).notification_preferences).toEqual(expected);
    expect(first.body).toEqual(expected);
  });

  it('keeps a preference change and a rename made while an unsubscribe link is in flight', async () => {
    const mail = app.get(MailService);
    const token = mail.createUnsubscribeToken(ownerId, 'emailOnMention');
    const unsubscribed = await interleave(
      userRepoOf(mail),
      () =>
        http()
          .post('/api/v1/notifications/unsubscribe')
          .send({ token })
          .expect(201)
          .then((response) => response),
      async () => {
        await patchPreferences({ emailOnStatusChange: false });
        await patchProfile({ displayName: 'Renamed While Unsubscribing' });
      },
    );

    const row = await ownerRow();
    expect(row.notification_preferences).toEqual({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      emailOnMention: false,
      emailOnStatusChange: false,
    });
    expect(row.display_name).toBe('Renamed While Unsubscribing');
    expect(unsubscribed.body).toEqual({ success: true, preference: 'emailOnMention' });
  });

  it('keeps a rename and an uploaded avatar made while a social sign-in is in flight', async () => {
    const signIn = await interleave(
      userRepoOf(app.get(AuthService)),
      () => oauthSignIn('github', 'https://avatars.example.invalid/provider.png'),
      () => patchProfile({ displayName: 'Renamed During Sign-In', avatarUrl: '/uploads/own.png' }),
    );

    const row = await ownerRow();
    expect(row.display_name).toBe('Renamed During Sign-In');
    // The provider's picture only fills an empty avatar; it never replaces one the user set.
    expect(row.avatar_url).toBe('/uploads/own.png');
    expect(row.auth_providers.split(',')).toEqual(['local', 'github']);
    expect(signIn.user).toMatchObject({
      displayName: 'Renamed During Sign-In',
      authProviders: ['local', 'github'],
    });
    expect(signIn.user).not.toHaveProperty('passwordHash');
    expect(signIn.user).not.toHaveProperty('sessionVersion');
  });

  it('keeps a provider another sign-in linked after this one looked up the account', async () => {
    const signIn = await interleave(
      userRepoOf(app.get(AuthService)),
      () => oauthSignIn('github'),
      () => oauthSignIn('google'),
    );

    expect((await ownerRow()).auth_providers.split(',')).toEqual(['local', 'google', 'github']);
    expect(signIn.user.authProviders).toEqual(['local', 'google', 'github']);
  });

  it('makes two sign-ins linking providers at the same moment take turns', async () => {
    // Pause the first sign-in inside its transaction, right after its locked read of the row.
    const findOne = Repository.prototype.findOne;
    let held = false;
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const spy = jest.spyOn(Repository.prototype, 'findOne').mockImplementation(async function (
      this: Repository<UserEntity>,
      options: FindOneOptions<UserEntity>,
    ) {
      const found = await findOne.call(this, options);
      if (!held && this.target === UserEntity && options.lock && found?.id === ownerId) {
        held = true;
        markLocked();
        await released;
      }
      return found;
    });

    try {
      const first = oauthSignIn('github');
      await Promise.race([
        locked,
        first.then(() => {
          throw new Error('linked the provider without locking the row');
        }),
      ]);
      const second = oauthSignIn('google');
      // The second sign-in must wait for the first one's row lock rather than read the
      // providers the first one is about to replace.
      await waitForRowLockWaiter();
      release();
      await Promise.all([first, second]);
    } finally {
      release();
      spy.mockRestore();
    }

    expect((await ownerRow()).auth_providers.split(',')).toEqual(['local', 'github', 'google']);
  });

  async function waitForRowLockWaiter() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [{ waiting }] = await dataSource.query(
        `SELECT count(*)::int AS waiting
           FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND query ILIKE '%"users"%FOR UPDATE%'`,
      );
      if (waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('the second sign-in never waited for the row lock');
  }
});
