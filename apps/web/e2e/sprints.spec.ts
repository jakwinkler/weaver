import { test, expect, apiCall, createProject } from './fixtures';

test('owner creates, starts, and completes a sprint from the browser', async ({ page, context, owner }) => {
  const project = await createProject(context, owner);
  const installed = await apiCall(context, owner, 'post', '/plugins/install', { pluginId: '@weaver/plugin-sprints' });
  expect(installed.status()).toBe(201);
  await page.goto('/projects/TEST/sprints');
  await expect(page.getByRole('heading', { name: 'Sprints', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'New Sprint' }).click();
  await page.getByLabel('Name').fill('Pilot Sprint');
  await page.getByLabel('Goal (optional)').fill('Complete the pilot');
  await page.getByRole('button', { name: 'Create Sprint' }).click();
  await expect(page.getByRole('heading', { name: 'Pilot Sprint' })).toBeVisible();
  await page.getByRole('button', { name: 'Start Sprint' }).click();
  await expect(page.getByText('active').first()).toBeVisible();
  await page.getByRole('button', { name: 'Complete Sprint' }).first().click();
  await expect(page.getByText('completed')).toBeVisible();
  await page.reload();
  await expect(page.getByText('completed')).toBeVisible();

  const response = await apiCall(context, owner, 'get', `/sprints?projectId=${project.id}`);
  expect(response.status()).toBe(200);
  expect((await response.json() as { name: string; status: string }[])
    .some((sprint) => sprint.name === 'Pilot Sprint' && sprint.status === 'completed')).toBe(true);
});
