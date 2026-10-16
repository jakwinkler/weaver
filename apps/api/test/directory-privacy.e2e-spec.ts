import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { TenantConnectionProvider } from '../src/core/tenant';

describe('Project directory privacy (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let connections: TenantConnectionProvider;
  let tenantId: string;
  let owner: string;
  let projectA: string;
  let projectB: string;
  let publicProject: string;
  let issueId: string;
  let teamId: string;
  let avatarId: string;
  let passwordHash: string;
  let outsiderId: string;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const emails: string[] = [];
  const schema = 'tenant_directory_privacy';
  const req = (token = owner) => ({
    get: (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).set('x-tenant-id', tenantId),
    post: (path: string) => request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).set('x-tenant-id', tenantId),
    patch: (path: string) => request(app.getHttpServer()).patch(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).set('x-tenant-id', tenantId),
    delete: (path: string) => request(app.getHttpServer()).delete(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).set('x-tenant-id', tenantId),
  });
  const addUser = async (name: string, role: string, displayName = `Privacy ${name}`) => {
    const email = `directory-${name}@example.invalid`;
    emails.push(email);
    const [row] = await db.query(`INSERT INTO public.users(email,display_name,password_hash,auth_provider) VALUES($1,$2,$3,'local') RETURNING id`, [email, displayName, passwordHash]);
    await db.query('INSERT INTO public.tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,$3)', [tenantId, row.id, role]);
    ids[name] = row.id;
    return row.id as string;
  };
  const ownIds = () => [ids.owner, ids.client, ids.peer].sort();
  const listIds = (body: { id: string }[]) => body.map((user) => user.id).sort();

  beforeAll(async () => {
    app = (await Test.createTestingModule({ imports: [AppModule] }).compile()).createNestApplication();
    app.setGlobalPrefix('api/v1'); await app.listen(0, '127.0.0.1');
    db = app.get(DataSource); connections = app.get(TenantConnectionProvider);
    const registered = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: 'directory-owner@example.invalid', password: 'password123', displayName: 'Privacy owner', orgName: 'Directory privacy', orgSlug: 'directory-privacy' }).expect(201);
    owner = registered.body.accessToken; tenantId = registered.body.tenantId; ids.owner = registered.body.user.id; emails.push('directory-owner@example.invalid');
    passwordHash = await bcrypt.hash('password123', 10);
    for (const [name, role] of [['staff', 'admin'], ['client', 'member'], ['other', 'viewer'], ['peer', 'member']]) {
      await addUser(name, role);
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: `directory-${name}@example.invalid`, password: 'password123' }).expect(201);
      tokens[name] = login.body.accessToken;
    }
    projectA = (await req().post('/projects').send({ key: 'DRA', name: 'Client A' }).expect(201)).body.id;
    projectB = (await req().post('/projects').send({ key: 'DRB', name: 'Client B' }).expect(201)).body.id;
    publicProject = (await req().post('/projects').send({ key: 'DRP', name: 'Public' }).expect(201)).body.id;
    await req().patch('/projects/DRP').send({ visibility: 'public' }).expect(200);
    emails.push('directory-outside@example.invalid');
    [ { id: outsiderId } ] = await db.query("INSERT INTO public.users(email,display_name,password_hash,auth_provider) VALUES('directory-outside@example.invalid','Privacy outside',$1,'local') RETURNING id", [passwordHash]);
    for (const name of ['client', 'peer']) await req().post('/projects/DRA/members').send({ userId: ids[name], role: 'member' }).expect(201);
    await req().post('/projects/DRB/members').send({ userId: ids.other, role: 'viewer' }).expect(201);
    await req().post('/projects/DRP/members').send({ userId: ids.other, role: 'viewer' }).expect(201);
    issueId = (await req().post('/projects/DRA/issues').send({ summary: 'Private A work' }).expect(201)).body.id;
    teamId = (await req().post('/teams').send({ name: 'Organization team' }).expect(201)).body.id;
    await req().post(`/teams/${teamId}/members`).send({ userId: ids.other }).expect(201);
    const avatar = await request(app.getHttpServer()).post('/api/v1/users/me/avatar').set('Authorization', `Bearer ${tokens.other}`).set('x-tenant-id', tenantId).attach('file', Buffer.from([137,80,78,71,13,10,26,10,0]), { filename: 'avatar.png', contentType: 'image/png' }).expect(201);
    avatarId = avatar.body.avatarUrl.split('/')[2];
  });
  afterAll(async () => {
    await connections.closeAll();
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.query('DELETE FROM public.tenants WHERE slug=$1', ['directory-privacy']);
    await db.query('DELETE FROM public.users WHERE email = ANY($1)', [emails]);
    await app.close();
  });

  it('limits collaborating clients to themselves and explicit project colleagues', async () => {
    expect(listIds((await req(tokens.client).get('/users').expect(200)).body)).toEqual(ownIds());
    const viewer = await req(tokens.other).get('/users').expect(200);
    expect(listIds(viewer.body)).toEqual([ids.owner, ids.other].sort());
  });
  it('filters exact email searches, blank typeahead and wildcard input on the server', async () => {
    const blank = await req(tokens.client).get('/users/search?q=').expect(200);
    expect(listIds(blank.body)).toEqual(ownIds());
    expect((await req(tokens.client).get('/users/search?q=directory-other%40example.invalid').expect(200)).body).toEqual([]);
    expect((await req(tokens.client).get('/users/search?q=Privacy%20peer').expect(200)).body.map((u: { id: string }) => u.id)).toEqual([ids.peer]);
    for (const q of ['%25', '_', '%5C']) expect((await req(tokens.client).get(`/users/search?q=${q}`).expect(200)).body).toEqual([]);
  });
  it('preserves the complete organization directory and search for agency owner/admin roles', async () => {
    for (const token of [owner, tokens.staff]) {
      expect(listIds((await req(token).get('/users').expect(200)).body)).toEqual(Object.values(ids).sort());
      expect((await req(token).get('/users/search?q=directory-other%40example.invalid').expect(200)).body.map((u: { id: string }) => u.id)).toEqual([ids.other]);
    }
  });
  it('returns the union of shared projects without using public visibility to expose people', async () => {
    expect(listIds((await req(tokens.client).get('/users').expect(200)).body)).not.toContain(ids.other);
    await req().post('/projects/DRB/members').send({ userId: ids.client, role: 'member' }).expect(201);
    try { expect(listIds((await req(tokens.client).get('/users').expect(200)).body)).toEqual([...ownIds(), ids.other].sort()); }
    finally { await req().delete(`/projects/DRB/members/${ids.client}`).expect(204); }
  });
  it('revokes directory visibility immediately with an existing client session', async () => {
    await req().delete(`/projects/DRA/members/${ids.client}`).expect(204);
    try {
      expect(listIds((await req(tokens.client).get('/users').expect(200)).body)).toEqual([ids.client]);
      expect(listIds((await req(tokens.client).get('/users/search?q=').expect(200)).body)).toEqual([ids.client]);
    } finally { await req().post('/projects/DRA/members').send({ userId: ids.client, role: 'member' }).expect(201); }
  });
  it('uses current roles when an agency admin is demoted without a new login', async () => {
    await req().patch(`/users/${ids.staff}/role`).send({ role: 'member' }).expect(200);
    try { expect(listIds((await req(tokens.staff).get('/users').expect(200)).body)).toEqual([ids.staff]); }
    finally { await req().patch(`/users/${ids.staff}/role`).send({ role: 'admin' }).expect(200); }
  });
  it('filters people before applying the typeahead result limit', async () => {
    for (let i = 0; i < 11; i++) await addUser(`hidden-${i}`, 'member', `A Hidden ${i}`);
    const response = await req(tokens.client).get('/users/search?q=').expect(200);
    expect(listIds(response.body)).toEqual(ownIds());
  });
  it('never expands the directory or assignee selection to people outside the organization', async () => {
    for (const token of [owner, tokens.staff, tokens.client]) {
      expect(listIds((await req(token).get('/users').expect(200)).body)).not.toContain(outsiderId);
      expect((await req(token).get('/users/search?q=directory-outside').expect(200)).body).toEqual([]);
      await req(token).patch('/issues/DRA-1').send({ assigneeId: outsiderId }).expect(403);
    }
  });
  it('does not expose hidden people through organization team rosters', async () => {
    for (const path of ['/teams', `/teams/${teamId}`, `/teams/${teamId}/members`]) {
      await req(tokens.client).get(path).expect(403);
      await req(tokens.staff).get(path).expect(200);
    }
  });
  it('does not expose hidden people in a public project roster', async () => {
    const response = await req(tokens.client).get('/projects/DRP/members').expect(200);
    expect(response.body.map((m: { userId: string }) => m.userId)).not.toContain(ids.other);
    const staff = await req(tokens.staff).get('/projects/DRP/members').expect(200);
    expect(staff.body.map((m: { userId: string }) => m.userId)).toContain(ids.other);
  });
  it('does not expose hidden profile avatars by a known attachment ID', async () => {
    await req(tokens.client).get(`/attachments/${avatarId}/download`).expect(403);
    await req(tokens.staff).get(`/attachments/${avatarId}/download`).expect(200);
    await req(tokens.other).get(`/attachments/${avatarId}/download`).expect(200);
  });
  it('rejects hidden assignees before create, update or bulk history can reveal their names', async () => {
    await req(tokens.client).post('/projects/DRA/issues').send({ summary: 'Forbidden assignee', assigneeId: ids.other }).expect(403);
    await req(tokens.client).patch('/issues/DRA-1').send({ assigneeId: ids.other }).expect(403);
    await req(tokens.client).patch('/issues/bulk').send({ issueIds: [issueId], updates: { assigneeId: ids.other } }).expect(403);
    await req(tokens.client).patch('/issues/DRA-1').send({ assigneeId: ids.peer }).expect(200);
    await req(tokens.client).patch('/issues/DRA-1').send({ assigneeId: null }).expect(200);
  });
  it('does not send a forced mention to a client outside the private project', async () => {
    await req(tokens.client).post('/issues/DRA-1/comments').send({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: ids.other, label: 'Hidden client' } }, { type: 'mention', attrs: { id: ids.peer, label: 'Colleague' } }] }] } }).expect(201);
    const updated = await req(tokens.client).post('/issues/DRA-1/comments').send({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before edit' }] }] } }).expect(201);
    await req(tokens.client).patch(`/issues/DRA-1/comments/${updated.body.id}`).send({ body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: ids.other, label: 'Hidden client' } }] }] } }).expect(200);
    const hidden = await req(tokens.other).get('/notifications').expect(200);
    expect(hidden.body.data.filter((n: { type: string }) => n.type === 'mention')).toEqual([]);
    const peer = await req(tokens.peer).get('/notifications').expect(200);
    expect(peer.body.data.some((n: { type: string }) => n.type === 'mention')).toBe(true);
  });
});
