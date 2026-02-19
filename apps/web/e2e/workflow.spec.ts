import { test, expect } from '@playwright/test';

test.describe('Workflow Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'e2e-test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('should navigate to workflow settings', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await page.click('text=Settings');
    await page.click('text=Workflow');
    await expect(page.locator('[data-testid="workflow-editor"]')).toBeVisible();
  });

  test('should display workflow states', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await page.click('text=Settings');
    await page.click('text=Workflow');
    await expect(page.locator('[data-testid="workflow-state"]').first()).toBeVisible();
  });

  test('should add a new workflow state', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await page.click('text=Settings');
    await page.click('text=Workflow');
    await page.click('text=Add State');
    await page.fill('[name="stateName"]', 'In Review');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=In Review')).toBeVisible();
  });
});
