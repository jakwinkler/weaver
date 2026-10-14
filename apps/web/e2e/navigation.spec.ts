import { test, expect, createIssue, createProject } from './fixtures';

test('owner can render the core and administration routes without browser exceptions', async ({ page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner);
  const exceptions: string[] = [];
  page.on('pageerror', (error) => exceptions.push(error.message));

  const routes: [string, RegExp | string][] = [
    ['/', /Welcome/],
    ['/projects', 'Projects'],
    ['/projects/TEST', 'E2E Project'],
    ['/projects/TEST/issues', 'Issues'],
    ['/projects/TEST/settings', 'Project Settings'],
    ['/issues/TEST-1', /TEST-1/],
    ['/search', 'Search'],
    ['/profile', 'Profile'],
    ['/admin/workflows', 'Workflows'],
    ['/admin/issue-types', 'Issue Types'],
    ['/admin/roles', 'Roles & Permissions'],
    ['/admin/teams', 'Teams'],
    ['/admin/users', 'Users'],
    ['/settings/custom-fields', 'Custom Fields'],
    ['/settings/plugins', 'Plugins'],
    ['/settings/webhooks', 'Webhooks'],
    ['/settings/import-export', 'Import / Export'],
    ['/settings/general', 'System Settings'],
  ];

  for (const [route, heading] of routes) {
    await test.step(route, async () => {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    });
  }
  expect(exceptions).toEqual([]);
});
