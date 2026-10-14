import { test, expect, apiCall, createIssue, createProject } from './fixtures';

test('issue creation, detail editing, and reload preserve changes', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await page.goto('/projects/TEST/issues');
  await page.getByRole('button', { name: 'Create Issue' }).click();
  await page.getByLabel('Summary').fill('Browser issue');
  await page.getByLabel('Type').selectOption({ label: 'Task' });
  await page.getByLabel('Priority').selectOption({ label: 'High' });
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name: 'TEST-1' })).toBeVisible();
  const createdRow = page.getByRole('row', { name: /TEST-1.*Browser issue/ });
  await expect(createdRow).toBeVisible();
  await expect(createdRow.getByRole('combobox').first()).toContainText('high');

  await page.getByRole('link', { name: 'TEST-1' }).click();
  await expect(page.getByRole('heading', { name: /TEST-1.*Browser issue/ })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Summary').fill('Updated browser issue');
  await page.getByLabel('Priority').selectOption({ label: 'Highest' });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: /Updated browser issue/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Updated browser issue/ })).toBeVisible();

  const response = await apiCall(context, owner, 'get', '/issues/TEST-1');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ summary: 'Updated browser issue', priority: 'highest' });
});

test('issue list inline edits persist after reload', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner, 'TEST', { summary: 'Inline issue', priority: 'low' });
  await page.goto('/projects/TEST/issues');
  const row = page.getByRole('row', { name: /TEST-1.*Inline issue/ });
  await expect(row).toBeVisible();
  await row.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'high', exact: true }).click();
  await expect(row.getByRole('combobox').first()).toContainText('high');
  await page.reload();
  await expect(page.getByRole('row', { name: /TEST-1.*Inline issue/ }).getByRole('combobox').first()).toContainText('high');
  const response = await apiCall(context, owner, 'get', '/issues/TEST-1');
  expect((await response.json()).priority).toBe('high');
});

test('deleted issues disappear from the project list', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner);
  await page.goto('/projects/TEST/issues');
  await expect(page.getByRole('link', { name: 'TEST-1' })).toBeVisible();
  const response = await apiCall(context, owner, 'delete', '/issues/TEST-1');
  expect(response.status()).toBe(204);
  await page.reload();
  await expect(page.getByText('No issues yet. Create your first issue to get started.')).toBeVisible();
});

test('issue comments appear after posting and reload', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner);
  await page.goto('/issues/TEST-1');
  const editor = page.locator('[contenteditable="true"]').last();
  await editor.fill('Pilot comment from browser');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.locator('[contenteditable="false"]').getByText('Pilot comment from browser')).toBeVisible();
  // Cross the draft autosave deadline before remounting the editor.
  await page.waitForTimeout(750);
  await page.reload();
  await expect(editor).toBeEmpty();
  await expect(page.locator('[contenteditable="false"]').getByText('Pilot comment from browser')).toBeVisible();
  const response = await apiCall(context, owner, 'get', '/issues/TEST-1/comments');
  expect(response.status()).toBe(200);
  expect(JSON.stringify(await response.json())).toContain('Pilot comment from browser');
});

test('time logs require the tenant time-tracking plugin', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner);
  const projectPluginsLoaded = page.waitForResponse((response) => response.url().endsWith('/projects/TEST/plugins'));
  await page.goto('/issues/TEST-1');
  await projectPluginsLoaded;
  await expect(page.getByRole('button', { name: 'Logs' })).toHaveCount(0);
  const installed = await apiCall(context, owner, 'post', '/plugins/install', { pluginId: '@weaver/plugin-time-tracking' });
  expect(installed.status()).toBe(201);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Logs' })).toBeVisible();
  await page.getByRole('button', { name: 'Logs' }).click();
  await page.getByLabel('Minutes').fill('90');
  await page.getByLabel('Description').fill('Pilot testing');
  await page.getByRole('button', { name: 'Log Time' }).click();
  await expect(page.getByText('Pilot testing')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Logs' }).click();
  await expect(page.getByText('Pilot testing')).toBeVisible();
  const entries = await apiCall(context, owner, 'get', '/issues/TEST-1/time-entries');
  expect(entries.status()).toBe(200);
  expect((await entries.json() as { minutes: number }[]).some((entry) => entry.minutes === 90)).toBe(true);
});
