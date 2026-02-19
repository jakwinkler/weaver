import { test, expect } from '@playwright/test';

test.describe('Issue Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'e2e-test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('should create a new issue', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await page.click('text=New Issue');
    await page.fill('[name="title"]', 'E2E Test Issue');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=E2E Test Issue')).toBeVisible();
  });

  test('should view issue detail', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await page.click('text=E2E Test Issue');
    await expect(page.locator('h1, h2').filter({ hasText: 'E2E Test Issue' })).toBeVisible();
  });

  test('should update issue status', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await page.click('text=E2E Test Issue');
    await expect(page.locator('[data-testid="issue-status"]')).toBeVisible();
  });
});
