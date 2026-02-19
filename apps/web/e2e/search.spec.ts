import { test, expect } from '@playwright/test';

test.describe('WQL Search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'e2e-test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('should open search dialog', async ({ page }) => {
    await page.click('[data-testid="search-trigger"]');
    await expect(page.locator('[data-testid="search-dialog"]')).toBeVisible();
  });

  test('should search for issues by text', async ({ page }) => {
    await page.click('[data-testid="search-trigger"]');
    await page.fill('[data-testid="search-input"]', 'E2E Test Issue');
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });

  test('should support WQL syntax', async ({ page }) => {
    await page.click('[data-testid="search-trigger"]');
    await page.fill('[data-testid="search-input"]', 'status:open project:E2E');
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });
});
