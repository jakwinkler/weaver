import { test, expect } from '@playwright/test';

test.describe('Auth Flow', () => {
  test('should register a new user', async ({ page }) => {
    await page.goto('/register');
    await page.fill('[name="email"]', 'e2e-test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.fill('[name="displayName"]', 'E2E Tester');
    await page.fill('[name="orgName"]', 'E2E Test Org');
    await page.fill('[name="orgSlug"]', 'e2e-test-org');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('should login with existing credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'e2e-test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
  });
});
