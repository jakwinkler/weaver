import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/core/auth';

describe('OAuth SSO (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let authService: AuthService;

  const linkedEmail = 'oauth-linked@example.com';
  const newEmail = 'oauth-new@example.com';
  const multiEmail = 'oauth-multi@example.com';
  const transientEmail = 'oauth-transient@example.com';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    dataSource = app.get(DataSource);
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await dataSource.query(`DELETE FROM public.tenants WHERE slug = ANY($1::text[])`, [
      ['oauth-multi-one', 'oauth-multi-two'],
    ]);
    await dataSource.query(`DELETE FROM public.users WHERE LOWER(email) = ANY($1::text[])`, [
      [linkedEmail, newEmail, multiEmail, transientEmail],
    ]);
    await app.close();
  });

  it('redirects Google sign-in to Google', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/google').expect(302);

    expect(response.headers.location).toContain('accounts.google.com');
    expect(response.headers.location).toContain('client_id=test-google-client');
    expect(response.headers.location).toContain('state=');
  });

  it('redirects GitHub sign-in to GitHub', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/auth/github').expect(302);

    expect(response.headers.location).toContain('github.com/login/oauth/authorize');
    expect(response.headers.location).toContain('client_id=test-github-client');
    expect(response.headers.location).toContain('state=');
  });

  it('links an OAuth provider to an existing local user by normalized email', async () => {
    const inserted = await dataSource.query(
      `INSERT INTO public.users
        (email, display_name, password_hash, auth_provider, auth_providers)
       VALUES ($1, $2, $3, 'local', 'local')
       RETURNING id`,
      [linkedEmail.toUpperCase(), 'Linked User', 'existing-password-hash'],
    );

    const result = await authService.completeOAuth({
      provider: 'google',
      email: linkedEmail.toUpperCase(),
      displayName: 'OAuth Display Name',
      avatarUrl: 'https://example.com/avatar.png',
    });

    const users = await dataSource.query(
      `SELECT id, auth_provider, auth_providers, password_hash
       FROM public.users WHERE LOWER(email) = $1`,
      [linkedEmail],
    );

    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(inserted[0].id);
    expect(users[0].password_hash).toBe('existing-password-hash');
    expect(users[0].auth_providers.split(',')).toEqual(expect.arrayContaining(['local', 'google']));
    expect(result.status).toBe('needsOrganization');
  });

  it('creates a new OAuth user and requires organization setup', async () => {
    const result = await authService.completeOAuth({
      provider: 'github',
      email: newEmail,
      displayName: 'New OAuth User',
      avatarUrl: null,
    });

    const users = await dataSource.query(
      `SELECT email, auth_provider, auth_providers, password_hash
       FROM public.users WHERE email = $1`,
      [newEmail],
    );

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: newEmail,
      auth_provider: 'github',
      auth_providers: 'github',
      password_hash: null,
    });
    expect(result.status).toBe('needsOrganization');
  });

  it('does not accept an OAuth handoff token as an API access token', async () => {
    const result = await authService.completeOAuth({
      provider: 'google',
      email: transientEmail,
      displayName: 'Transient OAuth User',
      avatarUrl: null,
    });
    const contextToken = authService.createOAuthContextToken(result.user.id, 'google');

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${contextToken}`)
      .expect(401);
  });

  it('requires multi-organization users to select an enabled membership', async () => {
    const firstLogin = await authService.completeOAuth({
      provider: 'github',
      email: multiEmail,
      displayName: 'Multi Org User',
      avatarUrl: null,
    });
    const userId = firstLogin.user.id;
    const tenants = await dataSource.query(
      `INSERT INTO public.tenants (name, slug, schema_name, plan, settings)
       VALUES
         ('OAuth Multi One', 'oauth-multi-one', 'tenant_oauth_multi_one', 'free', '{}'),
         ('OAuth Multi Two', 'oauth-multi-two', 'tenant_oauth_multi_two', 'free', '{}')
       RETURNING id, slug`,
    );
    await dataSource.query(
      `INSERT INTO public.tenant_memberships (tenant_id, user_id, role)
       VALUES ($1, $3, 'member'), ($2, $3, 'admin')`,
      [tenants[0].id, tenants[1].id, userId],
    );

    const result = await authService.completeOAuth({
      provider: 'github',
      email: multiEmail,
      displayName: 'Multi Org User',
      avatarUrl: null,
    });

    expect(result.status).toBe('chooseOrganization');
    expect(result.organizations).toHaveLength(2);

    const selected = await authService.selectOrganization(userId, 'github', tenants[1].id);
    expect(selected.tenantId).toBe(tenants[1].id);
    expect(selected.accessToken).toBeDefined();

    const settings = await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${selected.accessToken}`)
      .set('x-tenant-id', tenants[1].id)
      .send({
        sso: {
          google: { enabled: false },
          github: { enabled: true },
          saml: {
            enabled: true,
            idpUrl: 'https://idp.example.com/saml',
            cert: 'test-certificate',
          },
          oidc: {
            enabled: true,
            discoveryUrl: 'https://login.example.com',
            clientId: 'test-client',
            clientSecret: 'test-secret',
          },
        },
      })
      .expect(200);

    expect(settings.body.sso).toMatchObject({
      google: { enabled: false },
      github: { enabled: true },
      saml: { enabled: true },
      oidc: { enabled: true },
    });

    const samlRedirect = await request(app.getHttpServer())
      .get('/api/v1/auth/saml/oauth-multi-two')
      .expect(302);
    expect(samlRedirect.headers.location).toContain('https://idp.example.com/saml');
    expect(samlRedirect.headers.location).toContain('SAMLRequest=');
  });
});
