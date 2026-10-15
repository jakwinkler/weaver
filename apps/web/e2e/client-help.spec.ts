import type { BrowserContext, Page } from '@playwright/test';
import {
  test,
  expect,
  apiCall,
  apiBaseUrl,
  createIssue,
  createProject,
  uniqueId,
  type Owner,
} from './fixtures';

async function inviteClient(
  context: BrowserContext,
  owner: Owner,
  clientContext: BrowserContext,
  role: 'member' | 'viewer',
) {
  const email = `client-help-${uniqueId()}@example.invalid`;
  const invitation = await apiCall(context, owner, 'post', '/users/invitations', { email, role });
  expect(invitation.status()).toBe(201);
  const { token } = await invitation.json();
  const joined = await clientContext.request.post(
    `${apiBaseUrl}/auth/invitations/${token}/accept`,
    {
      data: { email, password: 'local-client-help-password-123', displayName: 'Alex Morgan' },
    },
  );
  expect(joined.status()).toBe(201);
  return { email, id: (await joined.json()).user.id };
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('local-client-help-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
}

for (const [name, viewport, hasTouch] of [
  ['desktop', { width: 1920, height: 1080 }, false],
  ['phone', { width: 390, height: 844 }, true],
] as const) {
  test(`invited client creates a description and replies on ${name}`, async ({
    browser,
    context,
    owner,
  }, testInfo) => {
    await createProject(context, owner, { name: 'Website Launch' });
    const clientContext = await browser.newContext({ viewport, hasTouch });
    try {
      const client = await inviteClient(context, owner, clientContext, 'member');
      const page = await clientContext.newPage();
      await signIn(page, client.email);
      await expect(
        page.getByText('No projects are available yet. Ask your team to add you to a project.'),
      ).toBeVisible();
      expect(
        (
          await apiCall(context, owner, 'post', '/projects/TEST/members', {
            userId: client.id,
            role: 'member',
          })
        ).status(),
      ).toBe(201);
      await page.goto('/projects/TEST/issues');
      await page.getByText('How to create and discuss issues', { exact: true }).click();
      await expect(page.getByText('Create a request.', { exact: true })).toBeVisible();
      await page.getByText('How to create and discuss issues', { exact: true }).click();
      if (hasTouch) await page.getByRole('button', { name: 'Create Issue', exact: true }).click();
      else await page.goto('/projects/TEST/issues?create=1');
      await expect(page.getByLabel('Summary', { exact: true })).toBeVisible({ timeout: 5000 });
      await page.getByLabel('Summary', { exact: true }).fill('Contact form needs a confirmation');
      const description = page.getByRole('textbox', { name: 'Description', exact: true });
      await expect(description).toHaveAttribute('aria-describedby', 'issueDescription-help');
      await description.fill(
        'After sending the contact form, I do not see a confirmation. Please show a message when it succeeds.',
      );
      await expect(page.getByLabel('Type', { exact: true })).not.toBeVisible();
      await page.getByText('More options (optional)', { exact: true }).click();
      const help = page.getByRole('button', { name: 'About Story Points', exact: true });
      if (hasTouch) await help.tap();
      else await help.focus();
      await expect(page.getByRole('tooltip')).toContainText('You can leave this blank.');
      if (hasTouch) await help.tap();
      else await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await page.getByLabel('Priority', { exact: true }).selectOption('high');
      await page.getByText('More options (optional)', { exact: true }).click();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page
        .locator('form')
        .screenshot({ path: testInfo.outputPath('client-create-issue.png') });
      if (hasTouch) {
        await expect(page.getByRole('button', { name: 'Image', exact: true })).toHaveCount(0);
        await description.evaluate((editor) => {
          const clipboardData = new DataTransfer();
          clipboardData.items.add(
            new File(['test image'], 'screenshot.png', { type: 'image/png' }),
          );
          editor.dispatchEvent(
            new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }),
          );
        });
        await expect(page.getByRole('alert')).toHaveText(
          'Create the issue first, then add files from Attachments.',
        );
      }
      if (!hasTouch) {
        await page.route('**/api/v1/projects/TEST/issues', async (route) => {
          if (route.request().method() === 'POST')
            await route.fulfill({ status: 503, json: { message: 'Temporary test failure' } });
          else await route.continue();
        });
        await page.getByRole('button', { name: 'Create', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('Your text is still here.');
        await expect(description).toContainText('After sending the contact form');
        await expect(page.getByLabel('Summary', { exact: true })).toHaveValue(
          'Contact form needs a confirmation',
        );
        await page.unroute('**/api/v1/projects/TEST/issues');
      }
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('link', { name: 'TEST-1', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Edit description', exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.locator('[contenteditable="false"]').getByText(/After sending the contact form/),
      ).toBeVisible();
      const saved = await apiCall(context, owner, 'get', '/issues/TEST-1');
      expect(JSON.stringify((await saved.json()).description)).toContain(
        'After sending the contact form',
      );
      await expect(
        page.getByText("Need someone's attention? Type @ and choose their name."),
      ).toBeVisible();
      const comment = page.getByRole('textbox', { name: 'Add a comment...', exact: true });
      await comment.fill('This happens on my phone as well.');
      await page.getByRole('button', { name: 'Comment', exact: true }).click();
      await expect(
        page.locator('[contenteditable="false"]').getByText('This happens on my phone as well.'),
      ).toBeVisible();
      await page.reload();
      await expect(comment).toBeEmpty();
      await expect(
        page.locator('[contenteditable="false"]').getByText('This happens on my phone as well.'),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page
        .getByRole('region', { name: 'Issue comments' })
        .screenshot({ path: testInfo.outputPath('client-issue-discussion.png') });
    } finally {
      await clientContext.close();
    }
  });
}

test('viewer sees read-only help and no create or reply controls', async ({
  browser,
  context,
  owner,
}) => {
  await createProject(context, owner);
  await createIssue(context, owner);
  const viewerContext = await browser.newContext();
  try {
    const viewer = await inviteClient(context, owner, viewerContext, 'viewer');
    expect(
      (
        await apiCall(context, owner, 'post', '/projects/TEST/members', {
          userId: viewer.id,
          role: 'viewer',
        })
      ).status(),
    ).toBe(201);
    const page = await viewerContext.newPage();
    await signIn(page, viewer.email);
    await page.goto('/projects/TEST/issues?create=1');
    await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Issue', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Summary', { exact: true })).toHaveCount(0);
    await page.goto('/issues/TEST-1');
    await expect(page.getByRole('heading', { name: /TEST-1/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^(Add details|Edit description|Comment)$/ }),
    ).toHaveCount(0);
    await page.getByText('How to create and discuss issues', { exact: true }).click();
    await expect(
      page.getByText(
        'You have read-only access. Ask your team if you need to create issues or reply.',
      ),
    ).toBeVisible();
  } finally {
    await viewerContext.close();
  }
});
