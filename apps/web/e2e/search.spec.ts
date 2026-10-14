import { test, expect, createIssue, createProject } from './fixtures';

const queryField = 'e.g. priority = "high" AND label = "bug"';

test('WQL search returns only issues matching the selected priority', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner, 'TEST', { summary: 'Urgent search result', priority: 'high' });
  await createIssue(context, owner, 'TEST', { summary: 'Low search result', priority: 'low' });
  await page.goto('/search');
  await page.getByPlaceholder(queryField).fill('priority = "high"');
  await page.getByRole('button', { name: 'Search', exact: true }).click();

  await expect(page.getByText('1 result found')).toBeVisible();
  await expect(page.getByRole('row', { name: /Urgent search result/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Low search result/ })).toHaveCount(0);
});

test('saved WQL filters load and search after a reload', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner, 'TEST', { summary: 'Saved search issue', priority: 'high' });
  await page.goto('/search');
  await page.getByPlaceholder(queryField).fill('priority = "high"');
  await page.getByRole('button', { name: 'Save Filter' }).click();
  await page.getByLabel('Filter Name').fill('High priority work');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'High priority work' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'High priority work' }).click();
  await expect(page.getByRole('row', { name: /Saved search issue/ })).toBeVisible();
});

test('invalid WQL reports an error and permits a valid retry', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner, 'TEST', { summary: 'Recovery issue', priority: 'high' });
  await page.goto('/search');
  await page.getByPlaceholder(queryField).fill('priority ???');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Search failed. Please check your query syntax and try again.')).toBeVisible();
  await page.getByPlaceholder(queryField).fill('priority = "high"');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('row', { name: /Recovery issue/ })).toBeVisible();
});
