import { test, expect } from '@playwright/test';

test.describe('Project CRUD', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('[name="email"]', 'e2e-test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('should create a new project', async ({ page }) => {
    await page.click('text=New Project');
    await page.fill('[name="name"]', 'E2E Test Project');
    await page.fill('[name="key"]', 'E2E');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=E2E Test Project')).toBeVisible();
  });

  test('should navigate to project detail', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await expect(page).toHaveURL(/\/projects\/E2E/);
  });
});
