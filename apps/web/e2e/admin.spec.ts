import { test, expect, apiCall } from './fixtures';

test('profile display name changes persist after reload', async ({ page, context, owner }) => {
  await page.goto('/profile');
  await page.getByLabel('Display name').fill('Renamed Pilot Owner');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Display name')).toHaveValue('Renamed Pilot Owner');
  const response = await apiCall(context, owner, 'get', '/users/me');
  expect((await response.json()).displayName).toBe('Renamed Pilot Owner');
});

test('owner creates a team that persists after reload', async ({ page, context, owner }) => {
  await page.goto('/admin/teams');
  await page.getByRole('button', { name: 'New Team' }).click();
  await page.getByPlaceholder('e.g., Frontend Team').fill('Pilot Team');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pilot Team' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pilot Team' })).toBeVisible();
  const response = await apiCall(context, owner, 'get', '/teams');
  expect((await response.json() as { name: string }[]).some((team) => team.name === 'Pilot Team')).toBe(true);
});

test('owner creates a private shareable invitation link from Users', async ({ page, owner }) => {
  expect(owner.tenantId).toBeTruthy();
  await page.goto('/admin/users');
  await page.getByLabel('Email address').fill('new-pilot@example.invalid');
  await page.getByLabel('Role').selectOption('viewer');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const invitationLink = page.getByLabel('Invitation link');
  await expect(invitationLink).toHaveValue(/\/invite\/[a-f0-9]{64}$/);
  expect(new URL(await invitationLink.inputValue()).origin).toBe(new URL(page.url()).origin);
  await expect(page.getByText('It expires in seven days and can be used once.', { exact: false })).toBeVisible();
});
