import { test, expect, apiCall } from './fixtures';

test('owner creates a workflow and a status that survive reload', async ({ page, context, owner }) => {
  await page.goto('/admin/workflows');
  await expect(page.getByRole('heading', { name: 'Workflows', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'New Workflow' }).click();
  await page.getByPlaceholder('e.g., Software Development').fill('Browser Workflow');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Add Status' })).toBeVisible();

  await page.getByRole('button', { name: '+ Add Status' }).click();
  await page.getByPlaceholder('e.g. In Review').fill('In Review');
  await page.getByRole('button', { name: 'Add Status', exact: true }).click();
  await expect(page.getByText('In Review')).toBeVisible();
  await page.reload();
  await expect(page.getByText('In Review')).toBeVisible();

  const response = await apiCall(context, owner, 'get', '/workflows');
  expect(response.status()).toBe(200);
  expect((await response.json()).some((workflow: { name: string }) => workflow.name === 'Browser Workflow')).toBe(true);
});

test('default workflow exposes status transitions', async ({ page, owner }) => {
  expect(owner.tenantId).toBeTruthy();
  await page.goto('/admin/workflows');
  await page.getByRole('link', { name: 'Default Workflow' }).click();
  await expect(page.getByText('To Do').first()).toBeVisible();
  await expect(page.getByText('In Progress').first()).toBeVisible();
  await expect(page.getByText('Done').first()).toBeVisible();
});
