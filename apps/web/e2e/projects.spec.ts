import { test, expect, apiCall, createProject, openProjects } from './fixtures';

test('owner creates a project, opens it, and edits its name', async ({ page, context, owner }) => {
  await openProjects(page);
  await page.getByRole('button', { name: 'Create Project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Browser Project');
  await page.getByLabel('Key', { exact: true }).fill('BROW');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByRole('link', { name: /BROW.*Browser Project/ }).last()).toBeVisible();
  await page.getByRole('link', { name: /BROW.*Browser Project/ }).last().click();
  await expect(page).toHaveURL(/\/projects\/BROW$/);
  await expect(page.getByRole('heading', { name: 'Browser Project' })).toBeVisible();

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Project Settings' })).toBeVisible();
  await page.getByLabel('Project Name').fill('Renamed Browser Project');
  await page.getByRole('button', { name: /save/i }).first().click();
  await page.reload();
  await expect(page.getByLabel('Project Name')).toHaveValue('Renamed Browser Project');

  const response = await apiCall(context, owner, 'get', '/projects/BROW');
  expect(response.status()).toBe(200);
  expect((await response.json()).name).toBe('Renamed Browser Project');
});

test('projects are listed and can be sorted by name', async ({ page, context, owner }) => {
  await createProject(context, owner, { name: 'Zebra Project', key: 'ZEBR' });
  await createProject(context, owner, { name: 'Alpha Project', key: 'ALPH' });
  await openProjects(page);
  await expect(page.getByRole('link', { name: /Alpha Project/ }).last()).toBeVisible();
  await expect(page.getByRole('link', { name: /Zebra Project/ }).last()).toBeVisible();

  await page.getByRole('columnheader', { name: /Project/ }).click();
  const rows = page.getByRole('row').filter({ has: page.getByRole('link', { name: /Project/ }) });
  await expect(rows.first()).toContainText('Alpha Project');
  await page.getByRole('columnheader', { name: /Project/ }).click();
  await expect(rows.first()).toContainText('Zebra Project');
});

test('duplicate project keys show a recoverable error', async ({ page, context, owner }) => {
  await createProject(context, owner, { name: 'Existing Project', key: 'SAME' });
  await openProjects(page);
  await page.getByRole('button', { name: 'Create Project' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Duplicate Project');
  await page.getByLabel('Key', { exact: true }).fill('SAME');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Failed to create project.')).toBeVisible();
  await page.getByLabel('Key', { exact: true }).fill('NEWK');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name: /NEWK.*Duplicate Project/ }).last()).toBeVisible();
});
