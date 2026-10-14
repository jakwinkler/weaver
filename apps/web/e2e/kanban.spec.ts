import { test, expect, apiCall, createIssue, createProject } from './fixtures';

async function enableBoard(context: Parameters<typeof createProject>[0], owner: Parameters<typeof createProject>[1]) {
  const install = await apiCall(context, owner, 'post', '/plugins/install', { pluginId: '@weaver/plugin-board' });
  expect(install.status()).toBe(201);
  const enable = await apiCall(context, owner, 'post', '/projects/TEST/plugins/enable', { pluginId: '@weaver/plugin-board' });
  expect(enable.status()).toBe(201);
}

test('board is gated until enabled, then a project board can be created', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await page.goto('/projects/TEST/board');
  await expect(page.getByRole('heading', { name: 'Feature not enabled' })).toBeVisible();

  await enableBoard(context, owner);
  await page.reload();
  await expect(page.getByText('Create a Kanban Board')).toBeVisible();
  await page.getByLabel('Board Name').fill('Pilot Board');
  await page.getByRole('button', { name: 'Create Board' }).click();
  await expect(page.getByRole('heading', { name: 'Pilot Board' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'To Do' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'In Progress' })).toBeVisible();
});

test('dragging an issue to another column persists its status', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner, 'TEST', { summary: 'Drag issue' });
  await enableBoard(context, owner);
  await page.goto('/projects/TEST/board');
  await page.getByLabel('Board Name').fill('Drag Board');
  await page.getByRole('button', { name: 'Create Board' }).click();
  const source = page.getByTestId('kanban-card').filter({ hasText: 'Drag issue' });
  const target = page.getByTestId('kanban-column').filter({ has: page.getByRole('heading', { name: 'In Progress' }) });
  await expect(source).toBeVisible();
  const statusSaved = page.waitForResponse((response) =>
    response.url().endsWith('/issues/TEST-1') && response.request().method() === 'PATCH',
  );
  await source.dragTo(target, { steps: 12 });
  await expect(target.getByText('Drag issue')).toBeVisible();
  expect((await statusSaved).status()).toBe(200);
  await page.reload();
  await expect(target.getByText('Drag issue')).toBeVisible();
});

test('disabling every project plugin does not silently restore defaults', async ({ context, owner }) => {
  await createProject(context, owner);
  const initial = await apiCall(context, owner, 'get', '/projects/TEST/plugins');
  expect(initial.status()).toBe(200);
  const plugins = await initial.json() as { pluginId: string }[];
  expect(plugins.length).toBeGreaterThan(0);
  for (const plugin of plugins) {
    const response = await apiCall(context, owner, 'post', '/projects/TEST/plugins/disable', { pluginId: plugin.pluginId });
    expect(response.status()).toBe(204);
  }
  const after = await apiCall(context, owner, 'get', '/projects/TEST/plugins');
  expect(after.status()).toBe(200);
  expect(await after.json()).toEqual([]);
});

test('sprints, gantt, and calendar require an installed tenant plugin', async ({ page, context, owner }) => {
  await createProject(context, owner);
  for (const view of ['sprints', 'gantt', 'calendar']) {
    await page.goto(`/projects/TEST/${view}`);
    await expect(page.getByRole('heading', { name: 'Feature not enabled' })).toBeVisible();
  }
});
