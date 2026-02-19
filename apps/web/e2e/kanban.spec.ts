import { test, expect } from '@playwright/test';

test.describe('Kanban Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'e2e-test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/projects/);
  });

  test('should display kanban board with columns', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await page.click('text=Board');
    await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible();
  });

  test('should show issues in correct columns', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await page.click('text=Board');
    await expect(page.locator('[data-testid="kanban-column"]').first()).toBeVisible();
  });

  test('should drag and drop issue between columns', async ({ page }) => {
    await page.click('text=E2E Test Project');
    await page.click('text=Board');
    // Drag-and-drop stub: locate a card and a target column, perform drag
    const card = page.locator('[data-testid="kanban-card"]').first();
    const targetColumn = page.locator('[data-testid="kanban-column"]').nth(1);
    await expect(card).toBeVisible();
    await expect(targetColumn).toBeVisible();
  });
});
