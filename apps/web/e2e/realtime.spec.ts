import type { BrowserContext, Page, WebSocketRoute } from '@playwright/test';
import {
  test,
  expect,
  apiCall,
  apiBaseUrl,
  createIssue,
  createProject,
  uniqueId,
  type Owner,
} from './fixtures';

const password = 'local-realtime-password-123';

/** Records the project rooms a page's socket asks for and the ones the gateway confirms. */
function watchProjectRooms(page: Page) {
  const rooms = { requested: [] as string[], joined: [] as string[], left: [] as string[] };
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      const message = String(payload).match(/"(join|leave):project",\{"projectKey":"([A-Z0-9]+)"\}/);
      if (message?.[1] === 'join') rooms.requested.push(message[2]);
      if (message?.[1] === 'leave') rooms.left.push(message[2]);
    });
    socket.on('framereceived', ({ payload }) => {
      const answer = String(payload).match(/"joined":true,"projectKey":"([A-Z0-9]+)"/);
      if (answer) rooms.joined.push(answer[1]);
    });
  });
  return rooms;
}

async function addTeammate(context: BrowserContext, owner: Owner, teammateContext: BrowserContext) {
  const email = `realtime-${uniqueId()}@example.invalid`;
  const invitation = await apiCall(context, owner, 'post', '/users/invitations', { email, role: 'member' });
  expect(invitation.status()).toBe(201);
  const { token } = await invitation.json();
  const accepted = await teammateContext.request.post(`${apiBaseUrl}/auth/invitations/${token}/accept`, {
    data: { email, password, displayName: 'Robin Lee' },
  });
  expect(accepted.status()).toBe(201);
  const userId = (await accepted.json()).user.id;
  const added = await apiCall(context, owner, 'post', '/projects/LIVE/members', { userId, role: 'member' });
  expect(added.status()).toBe(201);
  return email;
}

test('two sessions see each other\'s issue edits and comments without reloading', async ({
  browser,
  page,
  context,
  owner,
}) => {
  await createProject(context, owner, { name: 'Live Updates', key: 'LIVE' });
  await createIssue(context, owner, 'LIVE', { summary: 'Original summary' });
  const teammateContext = await browser.newContext();
  try {
    const email = await addTeammate(context, owner, teammateContext);
    const teammatePage = await teammateContext.newPage();
    const teammateRooms = watchProjectRooms(teammatePage);
    await teammatePage.goto('/login');
    await teammatePage.getByLabel('Email').fill(email);
    await teammatePage.getByLabel('Password').fill(password);
    await teammatePage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(teammatePage.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();

    const ownerRooms = watchProjectRooms(page);
    await page.goto('/issues/LIVE-1');
    await teammatePage.goto('/issues/LIVE-1');
    await expect(page.getByRole('heading', { name: /LIVE-1.*Original summary/ })).toBeVisible();
    await expect(teammatePage.getByRole('heading', { name: /LIVE-1.*Original summary/ })).toBeVisible();
    await expect.poll(() => ownerRooms.joined).toEqual(['LIVE']);
    await expect.poll(() => teammateRooms.joined).toEqual(['LIVE']);

    await teammatePage.getByRole('button', { name: 'Edit', exact: true }).click();
    await teammatePage.getByLabel('Summary').fill('Summary edited by teammate');
    await teammatePage.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: /LIVE-1.*Summary edited by teammate/ })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'LIVE-1 was updated' }).first()).toBeVisible();

    await page.locator('[contenteditable="true"]').last().fill('Live comment from owner');
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(
      teammatePage.locator('[contenteditable="false"]').getByText('Live comment from owner'),
    ).toBeVisible();

    // Moving within the project keeps the room; leaving the project leaves it.
    await page.getByRole('link', { name: 'Issues', exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/LIVE\/issues$/);
    const created = await apiCall(teammateContext, owner, 'post', '/projects/LIVE/issues', {
      summary: 'Created by teammate',
      priority: 'medium',
      labels: [],
      customFields: {},
      percentDone: 0,
    });
    expect(created.status()).toBe(201);
    await expect(page.getByRole('row', { name: /LIVE-2.*Created by teammate/ })).toBeVisible();
    expect(ownerRooms.requested).toEqual(['LIVE']);

    await page.getByRole('textbox', { name: 'Search issues, projects, and people' }).focus();
    await expect(page).toHaveURL(/\/search$/);
    await expect.poll(() => ownerRooms.left).toEqual(['LIVE']);
  } finally {
    await teammateContext.close();
  }
});

test('a session rejoins its project room after the connection drops', async ({ page, context, owner }) => {
  await createProject(context, owner, { name: 'Live Updates', key: 'LIVE' });
  await createIssue(context, owner, 'LIVE', { summary: 'Before the drop' });
  // The connection that carried each confirmed join. Dev StrictMode opens and drops an extra socket.
  const joins: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/socket\.io\//, (pageSide) => {
    const serverSide = pageSide.connectToServer();
    serverSide.onMessage((message) => {
      if (/"joined":true,"projectKey":"LIVE"/.test(String(message))) joins.push(serverSide);
      pageSide.send(message);
    });
  });

  await page.goto('/issues/LIVE-1');
  await expect(page.getByRole('heading', { name: /LIVE-1.*Before the drop/ })).toBeVisible();
  await expect.poll(() => joins.length).toBe(1);

  await joins[0].close();
  await expect.poll(() => joins.length).toBe(2);
  expect(joins[1]).not.toBe(joins[0]);

  const patched = await apiCall(context, owner, 'patch', '/issues/LIVE-1', { summary: 'After the drop' });
  expect(patched.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /LIVE-1.*After the drop/ })).toBeVisible();
});

test('a board shows issues created in another session without reloading', async ({ page, context, owner }) => {
  await createProject(context, owner, { name: 'Live Updates', key: 'LIVE' });
  await createIssue(context, owner, 'LIVE', { summary: 'Already planned' });
  const install = await apiCall(context, owner, 'post', '/plugins/install', { pluginId: '@weaver/plugin-board' });
  expect(install.status()).toBe(201);
  const enable = await apiCall(context, owner, 'post', '/projects/LIVE/plugins/enable', { pluginId: '@weaver/plugin-board' });
  expect(enable.status()).toBe(201);
  const rooms = watchProjectRooms(page);

  await page.goto('/projects/LIVE/board');
  await page.getByLabel('Board Name').fill('Live Board');
  await page.getByRole('button', { name: 'Create Board' }).click();
  await expect(page.getByTestId('kanban-card').filter({ hasText: 'Already planned' })).toBeVisible();
  await expect.poll(() => rooms.joined).toEqual(['LIVE']);

  await createIssue(context, owner, 'LIVE', { summary: 'Added elsewhere' });
  await expect(page.getByTestId('kanban-card').filter({ hasText: 'Added elsewhere' })).toBeVisible();
});
