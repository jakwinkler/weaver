import { test, expect, type BrowserContext, type APIResponse } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

type Manifest = {
  runId: string; baseUrl: string; revision: string; slug: string; orgName: string;
  accounts: Record<'owner' | 'staff' | 'client' | 'viewer', string>;
};

// Both the exact target and a fresh operator-prepared manifest are mandatory.
if (process.env.WEAVER_LIVE_CLIENT_ACCEPTANCE !== 'weaver.usercore.com') {
  throw new Error('Set WEAVER_LIVE_CLIENT_ACCEPTANCE=weaver.usercore.com only after live-test authorization and backup.');
}
const manifestPath = process.env.WEAVER_ACCEPTANCE_MANIFEST;
if (!manifestPath) throw new Error('WEAVER_ACCEPTANCE_MANIFEST is required.');
const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.baseUrl !== 'https://weaver.usercore.com' || !/^acceptance-\d{8}t\d{6}-[a-f0-9]{6}$/.test(manifest.slug)) {
  throw new Error('The manifest must target the expected live host and a disposable acceptance organization.');
}
if (manifest.slug !== `acceptance-${manifest.runId}` || Object.keys(manifest.accounts).sort().join(',') !== 'client,owner,staff,viewer') {
  throw new Error('The run ID, organization, and four account names must match the prepared manifest.');
}
for (const [name, email] of Object.entries(manifest.accounts)) {
  if (email !== `acceptance-${name}-${manifest.runId}@example.invalid`) throw new Error('Unexpected account in manifest.');
}
const output = process.env.WEAVER_ACCEPTANCE_OUTPUT || '/tmp/weaver-live-client-results';
mkdirSync(output, { recursive: true, mode: 0o700 });
const started = join(output, `${manifest.runId}.started`);
if (existsSync(started)) throw new Error('This manifest has already been used. Clean up and prepare a fresh run.');

test('live agency and client account acceptance in one disposable organization', async ({ browser }) => {
  writeFileSync(started, new Date().toISOString(), { flag: 'wx', mode: 0o600 });
  const checks: { name: string; passed: boolean; detail?: string }[] = [];
  const observations: { id: string; detail: string }[] = [];
  let teamId = '';
  let viewerAvatarId = '';
  const contexts: BrowserContext[] = [];
  const secrets: string[] = [];
  const pageErrors: string[] = [];
  let tenantId = '';
  const password = () => { const value = randomBytes(24).toString('base64url'); secrets.push(value); return value; };
  const safeError = (error: unknown) => {
    let text = error instanceof Error ? error.message : String(error);
    for (const secret of secrets) text = text.split(secret).join('[redacted]');
    return text.replace(/\/invite\/[A-Za-z0-9_-]+/g, '/invite/[redacted]').slice(0, 2500);
  };
  const context = async () => {
    const value = await browser.newContext({ baseURL: manifest.baseUrl, viewport: { width: 1920, height: 1080 } });
    contexts.push(value);
    value.on('page', (page) => page.on('pageerror', (error) => pageErrors.push(safeError(error))));
    return value;
  };
  const call = (ctx: BrowserContext, method: 'get' | 'post' | 'patch' | 'delete', path: string, data?: unknown) =>
    ctx.request[method](`/api/v1${path}`, { headers: tenantId ? { 'x-tenant-id': tenantId } : {}, ...(data === undefined ? {} : { data }) });
  const status = (response: APIResponse, wanted: number) => expect(response.status(), 'API response status').toBe(wanted);
  const check = async (name: string, action: () => Promise<void>) => {
    await test.step(name, async () => {
      try { await action(); checks.push({ name, passed: true }); console.log(`PASS: ${name}`); }
      catch (error) { checks.push({ name, passed: false, detail: safeError(error) }); console.log(`FAIL: ${name}`); }
    });
  };
  const richText = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const projects: Record<string, { id: string; key: string; name: string; issueKey: string; boardId: string; sprintId: string; pageSlug: string; attachmentId: string }> = {};

  try {
    const owner = await context();
    const ownerPassword = password();
    const registration = await call(owner, 'post', '/auth/register', {
      email: manifest.accounts.owner, password: ownerPassword, displayName: 'Acceptance Agency Owner',
      orgName: manifest.orgName, orgSlug: manifest.slug,
    });
    status(registration, 201);
    tenantId = (await registration.json()).tenantId;
    expect(typeof tenantId).toBe('string');
    writeFileSync(join(output, 'created.json'), JSON.stringify({ tenantId, slug: manifest.slug }, null, 2), { mode: 0o600 });
    const ownerPage = await owner.newPage();
    await ownerPage.goto('/login');
    await ownerPage.getByLabel('Email').fill(manifest.accounts.owner);
    await ownerPage.getByLabel('Password').fill(ownerPassword);
    await ownerPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(ownerPage.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
    checks.push({ name: 'Owner registration creates a usable live organization', passed: true });

    for (const [key, label] of [['CLA', 'Client A'], ['CLB', 'Client B'], ['INT', 'Agency Internal']]) {
      const created = await call(owner, 'post', '/projects', { key, name: `${label} ${manifest.runId}` });
      status(created, 201);
      const project = await created.json();
      expect(project.visibility).toBe('private');
      const issue = await call(owner, 'post', `/projects/${key}/issues`, { summary: `${label} confidential ${manifest.runId}`, priority: 'high' });
      status(issue, 201);
      const issueKey = (await issue.json()).key;
      const board = await call(owner, 'post', `/boards?projectId=${project.id}`, { name: `${label} board`, type: 'kanban' });
      status(board, 201);
      const sprint = await call(owner, 'post', `/sprints?projectId=${project.id}`, { name: `${label} sprint` });
      status(sprint, 201);
      const page = await call(owner, 'post', `/projects/${key}/pages`, { title: `${label} private wiki`, body: richText(`${label} private documentation`) });
      status(page, 201);
      const attachment = await owner.request.post(`/api/v1/issues/${issueKey}/attachments`, {
        headers: { 'x-tenant-id': tenantId },
        multipart: { file: { name: `${key}-acceptance.txt`, mimeType: 'text/plain', buffer: Buffer.from(`${label} synthetic attachment ${manifest.runId}`) } },
      });
      status(attachment, 201);
      projects[key] = { ...project, issueKey, boardId: (await board.json()).id, sprintId: (await sprint.json()).id, pageSlug: (await page.json()).slug, attachmentId: (await attachment.json()).id };
    }
    status(await call(owner, 'post', '/plugins/install', { pluginId: '@weaver/plugin-board' }), 201);
    status(await call(owner, 'post', '/projects/CLA/plugins/enable', { pluginId: '@weaver/plugin-board' }), 201);
    checks.push({ name: 'Three projects default to private; issue, board, sprint, wiki, and real attachment storage work', passed: true });

    const invited = async (name: 'staff' | 'client' | 'viewer', role: 'member' | 'viewer', ui = false) => {
      const invitation = await call(owner, 'post', '/users/invitations', { email: manifest.accounts[name], role });
      status(invitation, 201);
      const token = (await invitation.json()).token as string;
      secrets.push(token);
      const ctx = await context();
      const accountPassword = password();
      if (ui) {
        const page = await ctx.newPage();
        await page.goto(`/invite/${token}`);
        await expect(page.getByLabel('Display Name')).toBeVisible();
        await page.getByLabel('Display Name').fill(`Acceptance ${name}`);
        await page.getByLabel('Password').fill(accountPassword);
        await page.getByRole('button', { name: 'Join organization' }).click();
        await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
      } else {
        status(await call(ctx, 'post', `/auth/invitations/${token}/accept`, { email: manifest.accounts[name], displayName: `Acceptance ${name}`, password: accountPassword }), 201);
      }
      const info = await call(ctx, 'get', '/auth/session');
      status(info, 200);
      const session = await info.json();
      expect(session.tenantId).toBe(tenantId);
      return { ctx, password: accountPassword, id: session.user.id, token };
    };
    const staff = await invited('staff', 'member');
    const client = await invited('client', 'member', true);
    const viewer = await invited('viewer', 'viewer', true);
    status(await call(owner, 'patch', `/users/${staff.id}/role`, { role: 'admin' }), 200);
    const staffPage = await staff.ctx.newPage();
    await staffPage.goto('/login');
    await staffPage.getByLabel('Email').fill(manifest.accounts.staff);
    await staffPage.getByLabel('Password').fill(staff.password);
    await staffPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(staffPage.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
    status(await call(owner, 'post', '/projects/CLA/members', { userId: client.id, role: 'member' }), 201);
    status(await call(owner, 'post', '/projects/CLB/members', { userId: viewer.id, role: 'viewer' }), 201);
    const team = await call(owner, 'post', '/teams', { name: 'Acceptance organization team' });
    status(team, 201); teamId = (await team.json()).id;
    status(await call(owner, 'post', `/teams/${teamId}/members`, { userId: viewer.id }), 201);
    const avatar = await viewer.ctx.request.post('/api/v1/users/me/avatar', {
      headers: { 'x-tenant-id': tenantId },
      multipart: { file: { name: 'acceptance-avatar.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNwzHz4HwAFBQKLjf7hrwAAAABJRU5ErkJggg==', 'base64') } },
    });
    status(avatar, 201); viewerAvatarId = (await avatar.json()).avatarUrl.split('/')[2];
    checks.push({ name: 'Member and viewer accept live invitations in the browser and join the same organization', passed: true });

    await check('Invitations are single use', async () => {
      const anonymous = await context();
      status(await call(anonymous, 'get', `/auth/invitations/${client.token}`), 401);
      status(await call(anonymous, 'post', `/auth/invitations/${client.token}/accept`, { email: manifest.accounts.client, password: client.password, displayName: 'Replay' }), 401);
    });

    await check('Agency admin sees every private project without project membership', async () => {
      const response = await call(staff.ctx, 'get', '/projects'); status(response, 200);
      expect((await response.json()).data.map((p: { key: string }) => p.key).sort()).toEqual(['CLA', 'CLB', 'INT']);
      const page = await staff.ctx.newPage(); await page.goto('/projects');
      for (const project of Object.values(projects)) {
        await expect(page.getByText(project.name, { exact: true })).toBeVisible();
        status(await call(staff.ctx, 'get', `/issues/${project.issueKey}`), 200);
      }
      status(await call(staff.ctx, 'patch', `/issues/${projects.INT.issueKey}`, { summary: `Agency updated confidential ${manifest.runId}` }), 200);
      await page.screenshot({ path: join(output, 'agency-projects.png'), fullPage: true });
    });

    for (const [actor, ownKey] of [[client, 'CLA'], [viewer, 'CLB']] as const) {
      await check(`${ownKey} client project list and browser show only the assigned project`, async () => {
        const listed = await call(actor.ctx, 'get', '/projects'); status(listed, 200);
        expect((await listed.json()).data.map((p: { key: string }) => p.key)).toEqual([ownKey]);
        const page = await actor.ctx.newPage(); await page.goto('/projects');
        await expect(page.getByText(projects[ownKey].name, { exact: true })).toBeVisible();
        for (const key of Object.keys(projects).filter((key) => key !== ownKey)) {
          await expect(page.getByText(projects[key].name, { exact: true })).toHaveCount(0);
        }
        await expect(page.getByRole('button', { name: 'Create Project' })).toHaveCount(0);
        await page.screenshot({ path: join(output, `${ownKey}-projects.png`), fullPage: true });
      });

      await check(`${ownKey} client can read assigned issues, wiki, boards, sprints, comments, and attachments`, async () => {
        const project = projects[ownKey];
        for (const path of [`/projects/${ownKey}`, `/projects/${ownKey}/workflow`, `/projects/${ownKey}/issues`, `/issues/${project.issueKey}`, `/issues/${project.issueKey}/comments`, `/projects/${ownKey}/pages/${project.pageSlug}`, `/boards/${project.boardId}/issues`, `/sprints/${project.sprintId}`, `/issues/${project.issueKey}/attachments`]) {
          status(await call(actor.ctx, 'get', path), 200);
        }
        const download = await call(actor.ctx, 'get', `/attachments/${project.attachmentId}/download`);
        status(download, 200); expect(await download.text()).toContain(manifest.runId);
      });

      for (const hiddenKey of Object.keys(projects).filter((key) => key !== ownKey)) {
        const hidden = projects[hiddenKey];
        await check(`${ownKey} client receives 403 for ${hiddenKey} project and every tested related resource`, async () => {
          for (const path of [`/projects/${hiddenKey}`, `/projects/${hiddenKey}/workflow`, `/projects/${hiddenKey}/issues`, `/projects/${hiddenKey}/members`, `/issues/${hidden.issueKey}`, `/issues/${hidden.issueKey}/comments`, `/issues/${hidden.issueKey}/attachments`, `/projects/${hiddenKey}/pages`, `/projects/${hiddenKey}/pages/${hidden.pageSlug}`, `/boards?projectId=${hidden.id}`, `/boards/${hidden.boardId}/issues`, `/sprints?projectId=${hidden.id}`, `/sprints/${hidden.sprintId}`, `/attachments/${hidden.attachmentId}/download`]) {
            const response = await call(actor.ctx, 'get', path);
            expect(response.status(), `Deny ${path}`).toBe(403);
          }
          status(await call(actor.ctx, 'patch', `/issues/${hidden.issueKey}`, { summary: 'Unauthorized acceptance change' }), 403);
        });
      }

      await check(`${ownKey} search and dashboard contain no other project data`, async () => {
        const search = await call(actor.ctx, 'post', '/search', { query: `summary ~ "${manifest.runId}" OR summary ~ "confidential"` });
        status(search, 201);
        const found = (await search.json()).data;
        expect(found.length).toBeGreaterThan(0);
        expect(found.every((issue: { projectId: string }) => issue.projectId === projects[ownKey].id)).toBe(true);
        const dashboard = await call(actor.ctx, 'get', '/dashboard'); status(dashboard, 200);
        const data = await dashboard.json();
        expect(data.stats.totalProjects).toBe(1);
        expect(data.projectOverviews.map((project: { key: string }) => project.key)).toEqual([ownKey]);
      });

      await check(`${ownKey} client cannot invite users, promote itself, or change project settings`, async () => {
        status(await call(actor.ctx, 'post', '/users/invitations', { email: `forbidden-${manifest.runId}@example.invalid`, role: 'member' }), 403);
        status(await call(actor.ctx, 'patch', `/users/${actor.id}/role`, { role: 'admin' }), 403);
        status(await call(actor.ctx, 'patch', `/projects/${ownKey}`, { visibility: 'public' }), 403);
      });
    }

    await check('Member client creates, edits, changes status, and comments in the browser; changes survive reload', async () => {
      const page = await client.ctx.newPage(); await page.goto('/projects/CLA/issues');
      await page.getByRole('button', { name: 'Create Issue' }).click();
      await page.getByLabel('Summary').fill(`Client requested work ${manifest.runId}`);
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(page.getByRole('link', { name: 'CLA-2', exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'CLA-2', exact: true }).click();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByLabel('Summary').fill(`Client edited work ${manifest.runId}`);
      await page.getByRole('button', { name: 'Save changes' }).click();
      await page.locator('[contenteditable="true"]').last().fill('Live client acceptance comment');
      await page.getByRole('button', { name: 'Comment', exact: true }).click();
      await expect(page.locator('[contenteditable="false"]').getByText('Live client acceptance comment', { exact: true })).toBeVisible();
      // Cross the autosave deadline so reload cannot hide a delayed stale draft.
      await page.waitForTimeout(750);
      await expect(page.getByRole('button', { name: 'To Do', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'To Do', exact: true }).click();
      await page.getByRole('menuitem', { name: 'In Progress', exact: true }).click();
      await expect(page.getByRole('button', { name: 'In Progress', exact: true })).toBeVisible();
      await page.reload();
      await expect(page.locator('[contenteditable="true"]').last()).toBeEmpty();
      await expect(page.getByRole('heading', { name: new RegExp(`Client edited work ${manifest.runId}`) })).toBeVisible();
      await expect(page.locator('[contenteditable="false"]').getByText('Live client acceptance comment', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'In Progress', exact: true })).toBeVisible();
      await page.screenshot({ path: join(output, 'client-collaboration.png'), fullPage: true });
    });

    await check('Member client can upload and download a synthetic attachment through live storage', async () => {
      const upload = await client.ctx.request.post('/api/v1/issues/CLA-1/attachments', {
        headers: { 'x-tenant-id': tenantId }, multipart: { file: { name: 'client-upload.txt', mimeType: 'text/plain', buffer: Buffer.from(`Client upload ${manifest.runId}`) } },
      });
      status(upload, 201);
      const id = (await upload.json()).id;
      const download = await call(client.ctx, 'get', `/attachments/${id}/download`);
      status(download, 200); expect(await download.text()).toBe(`Client upload ${manifest.runId}`);
      status(await call(viewer.ctx, 'get', `/attachments/${id}/download`), 403);
    });

    await check('Read-only client has no edit/comment controls and cannot write through the API', async () => {
      const page = await viewer.ctx.newPage(); await page.goto(`/issues/${projects.CLB.issueKey}`);
      await expect(page.getByRole('heading', { name: new RegExp(`Client B confidential ${manifest.runId}`) })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
      await expect(page.getByText('To Do', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Comment', exact: true })).toHaveCount(0);
      status(await call(viewer.ctx, 'post', '/projects/CLB/issues', { summary: 'Forbidden viewer issue' }), 403);
      status(await call(viewer.ctx, 'patch', `/issues/${projects.CLB.issueKey}`, { summary: 'Forbidden viewer edit' }), 403);
      status(await call(viewer.ctx, 'post', `/issues/${projects.CLB.issueKey}/comments`, { body: richText('Forbidden viewer comment') }), 403);
      await page.screenshot({ path: join(output, 'viewer-read-only.png'), fullPage: true });
    });

    await check('Client board loads its own issues in the deployed browser', async () => {
      const page = await client.ctx.newPage(); await page.goto('/projects/CLA/board');
      await expect(page.getByRole('heading', { name: 'Client A board', exact: true })).toBeVisible();
      await expect(page.getByText(`Client A confidential ${manifest.runId}`, { exact: true })).toBeVisible();
    });

    await check('Direct browser navigation cannot render another client issue', async () => {
      const page = await client.ctx.newPage();
      const denied = page.waitForResponse((response) => response.url().endsWith(`/api/v1/issues/${projects.CLB.issueKey}`));
      await page.goto(`/issues/${projects.CLB.issueKey}`);
      expect((await denied).status()).toBe(403);
      await expect(page.getByText('Issue not found.', { exact: true })).toBeVisible();
      await expect(page.getByText(`Client B confidential ${manifest.runId}`, { exact: true })).toHaveCount(0);
    });

    await check('Anonymous public routes do not expose any private project', async () => {
      const anon = await context();
      const list = await call(anon, 'get', `/public/${manifest.slug}/projects`); status(list, 200);
      expect((await list.json()).data).toEqual([]);
      for (const key of Object.keys(projects)) status(await call(anon, 'get', `/public/${manifest.slug}/projects/${key}`), 404);
      status(await call(anon, 'get', '/projects/CLA'), 401);
    });

    await check('Client directories and exact-email search show only self and project colleagues', async () => {
      const ownerId = (await (await call(owner, 'get', '/auth/session')).json()).user.id;
      for (const actor of [client, viewer]) {
        const expected = [ownerId, actor.id].sort();
        const directory = await call(actor.ctx, 'get', '/users'); status(directory, 200);
        expect((await directory.json()).map((u: { id: string }) => u.id).sort()).toEqual(expected);
        const search = await call(actor.ctx, 'get', '/users/search?q='); status(search, 200);
        expect((await search.json()).map((u: { id: string }) => u.id).sort()).toEqual(expected);
        const otherEmail = actor === client ? manifest.accounts.viewer : manifest.accounts.client;
        const hidden = await call(actor.ctx, 'get', `/users/search?q=${encodeURIComponent(otherEmail)}`); status(hidden, 200);
        expect(await hidden.json()).toEqual([]);
        for (const path of ['/teams', `/teams/${teamId}`, `/teams/${teamId}/members`]) status(await call(actor.ctx, 'get', path), 403);
      }
    });

    await check('Hidden profile avatars remain inaccessible by a known attachment ID', async () => {
      status(await call(client.ctx, 'get', `/attachments/${viewerAvatarId}/download`), 403);
      status(await call(staff.ctx, 'get', `/attachments/${viewerAvatarId}/download`), 200);
      status(await call(viewer.ctx, 'get', `/attachments/${viewerAvatarId}/download`), 200);
    });

    await check('Agency staff retain every organization member in directory, search, and teams', async () => {
      for (const actor of [owner, staff.ctx]) {
        const listed = await call(actor, 'get', '/users'); status(listed, 200);
        expect((await listed.json()).map((u: { email: string }) => u.email).sort()).toEqual(Object.values(manifest.accounts).sort());
        const search = await call(actor, 'get', '/users/search?q='); status(search, 200); expect(await search.json()).toHaveLength(4);
        status(await call(actor, 'get', `/teams/${teamId}/members`), 200);
      }
    });

    await check('Client assignee and mention pickers contain colleagues and exclude unrelated clients and staff', async () => {
      const page = await client.ctx.newPage(); await page.goto('/issues/CLA-1');
      await page.getByRole('button', { name: 'Unassigned', exact: true }).click();
      await expect(page.getByRole('menuitem', { name: /Acceptance Agency Owner/ })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /Acceptance viewer|Acceptance staff/ })).toHaveCount(0);
      await page.screenshot({ path: join(output, 'client-assignee-privacy.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await page.getByLabel('Add a comment...', { exact: true }).pressSequentially('@Acceptance');
      const suggestions = page.getByRole('listbox', { name: 'Mention a person' });
      await expect(suggestions.getByRole('option', { name: 'Acceptance Agency Owner', exact: true })).toBeVisible();
      await expect(suggestions.getByRole('option', { name: /Acceptance viewer|Acceptance staff/ })).toHaveCount(0);
      await page.screenshot({ path: join(output, 'client-mention-privacy.png'), fullPage: true });
      await page.close();
    });

    await check('Client directory adds and removes colleagues when a shared project changes', async () => {
      status(await call(owner, 'post', '/projects/CLB/members', { userId: client.id, role: 'viewer' }), 201);
      try {
        const response = await call(client.ctx, 'get', '/users'); status(response, 200);
        expect((await response.json()).some((u: { id: string }) => u.id === viewer.id)).toBe(true);
      } finally { status(await call(owner, 'delete', `/projects/CLB/members/${client.id}`), 204); }
      const response = await call(client.ctx, 'get', '/users'); status(response, 200);
      expect((await response.json()).some((u: { id: string }) => u.id === viewer.id)).toBe(false);
    });

    await check('Forged hidden assignees and mentions cannot expose another client', async () => {
      status(await call(client.ctx, 'post', '/projects/CLA/issues', { summary: 'Forbidden identity lookup', assigneeId: viewer.id }), 403);
      status(await call(client.ctx, 'patch', '/issues/CLA-1', { assigneeId: viewer.id }), 403);
      const mentioned = await call(client.ctx, 'post', '/issues/CLA-1/comments', { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: viewer.id, label: 'Hidden client' } }] }] } });
      status(mentioned, 201);
      const notifications = await call(viewer.ctx, 'get', '/notifications'); status(notifications, 200);
      expect((await notifications.json()).data.some((n: { type: string }) => n.type === 'mention')).toBe(false);
    });

    await check('Removing a project membership immediately revokes existing client access', async () => {
      status(await call(owner, 'delete', `/projects/CLA/members/${client.id}`), 204);
      status(await call(client.ctx, 'get', '/issues/CLA-1'), 403);
      const list = await call(client.ctx, 'get', '/projects'); status(list, 200);
      expect((await list.json()).data).toEqual([]);
      const people = await call(client.ctx, 'get', '/users'); status(people, 200);
      expect((await people.json()).map((u: { id: string }) => u.id)).toEqual([client.id]);
      status(await call(owner, 'post', '/projects/CLA/members', { userId: client.id, role: 'member' }), 201);
      status(await call(client.ctx, 'get', '/issues/CLA-1'), 200);
    });

    await check('Client can sign out, sign in again, and restore only its assigned project', async () => {
      status(await call(client.ctx, 'post', '/auth/logout'), 204);
      status(await call(client.ctx, 'get', '/projects'), 401);
      const page = await client.ctx.newPage(); await page.goto('/login');
      await page.getByLabel('Email').fill(manifest.accounts.client);
      await page.getByLabel('Password').fill(client.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
      await expect(page.getByText(projects.CLA.name, { exact: true })).toBeVisible();
      await expect(page.getByText(projects.CLB.name, { exact: true })).toHaveCount(0);
    });

    await check('No unhandled browser JavaScript errors occurred', async () => { expect(pageErrors).toEqual([]); });
  } catch (error) {
    checks.push({ name: 'Acceptance setup and fixture creation', passed: false, detail: safeError(error) });
  } finally {
    for (const ctx of contexts) {
      try { await call(ctx, 'post', '/auth/logout'); } catch { /* Database cleanup revokes any residual sessions. */ }
      await ctx.close();
    }
    const report = { runId: manifest.runId, revision: manifest.revision, baseUrl: manifest.baseUrl, tenantId, completedAt: new Date().toISOString(), checks, observations, passed: checks.filter((c) => c.passed).length, failed: checks.filter((c) => !c.passed).length, cleanupRequired: true };
    writeFileSync(join(output, 'acceptance.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ passed: report.passed, failed: report.failed, observations }));
  }
  expect(checks.filter((check) => !check.passed), 'Acceptance failures (sanitized)').toEqual([]);
});
