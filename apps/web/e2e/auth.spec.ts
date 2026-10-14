import { test as anonymousTest, expect } from '@playwright/test';
import { test, registerOwner, uniqueId, openProjects, apiBaseUrl } from './fixtures';

anonymousTest('protected pages redirect anonymous visitors to sign in', async ({ page }) => {
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

anonymousTest('registration creates a usable browser session that survives reload', async ({ page }) => {
  const id = uniqueId();
  await page.goto('/register');
  await page.getByLabel('Display Name').fill('New Test Owner');
  await page.getByLabel('Email').fill('new-' + id + '@example.invalid');
  await page.getByLabel('Password').fill('local-e2e-password-123');
  await page.getByLabel('Organization Name').fill('Browser Registration');
  await page.getByLabel('Organization Slug').fill('browser-' + id);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
});

anonymousTest('existing owner signs in, and invalid credentials show an error', async ({ page, request }) => {
  const owner = await registerOwner(request);
  await page.goto('/login');
  await page.getByLabel('Email').fill(owner.email);
  await page.getByLabel('Password').fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Invalid email or password. Please try again.')).toBeVisible();

  await page.getByLabel('Password').fill(owner.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
});

anonymousTest('email letter case does not lock out a registered owner', async ({ page, request }) => {
  const id = uniqueId();
  const response = await request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email: `Pilot-${id}@Example.Invalid`,
      password: 'local-e2e-password-123',
      displayName: 'Mixed Case Owner',
      orgName: 'Email Case Test',
      orgSlug: `email-case-${id}`,
    },
  });
  expect(response.status()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Email').fill(`pilot-${id}@example.invalid`);
  await page.getByLabel('Password').fill('local-e2e-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test('sign out clears the session and blocks protected pages', async ({ page, owner }) => {
  await openProjects(page);
  await page.getByRole('button', { name: new RegExp(owner.displayName) }).click();
  await page.getByRole('menuitem', { name: /logout|sign out|log out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
});
