import { test, expect, createIssue, createProject } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

test('mobile viewport keeps projects and issue details usable', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner, 'TEST', { summary: 'Mobile pilot issue' });
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await page.goto('/projects/TEST/issues');
  await expect(page.getByRole('heading', { name: 'Issues', level: 1 })).toBeVisible();
  await page.goto('/issues/TEST-1');
  await expect(page.getByRole('heading', { name: /Mobile pilot issue/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
