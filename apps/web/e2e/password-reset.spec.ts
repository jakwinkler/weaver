import { test, expect, type APIRequestContext } from '@playwright/test';
import { registerOwner, uniqueId } from './fixtures';

// The API and worker must send through a local Mailpit; see e2e/README.md.
const mailpitUrl = process.env.PLAYWRIGHT_MAILPIT_URL;
if (mailpitUrl && !['127.0.0.1', 'localhost'].includes(new URL(mailpitUrl).hostname)) {
  throw new Error('PLAYWRIGHT_MAILPIT_URL must be a local Mailpit.');
}

interface MailpitSummary {
  ID: string;
  Subject: string;
}

async function waitForEmail(
  request: APIRequestContext,
  to: string,
  subject: string,
  timeoutMs = 20_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await request.get(`${mailpitUrl}/api/v1/search`, {
      params: { query: `to:"${to}" subject:"${subject}"` },
    });
    const { messages } = (await search.json()) as { messages: MailpitSummary[] };
    if (messages.length > 0) {
      const message = await request.get(`${mailpitUrl}/api/v1/message/${messages[0].ID}`);
      return ((await message.json()) as { Text: string }).Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No "${subject}" email reached ${to}`);
}

async function countEmails(request: APIRequestContext, to: string): Promise<number> {
  const search = await request.get(`${mailpitUrl}/api/v1/search`, {
    params: { query: `to:"${to}"` },
  });
  return ((await search.json()) as { messages: MailpitSummary[] }).messages.length;
}

test.describe('forgotten password', () => {
  test.skip(
    !mailpitUrl,
    'Set PLAYWRIGHT_MAILPIT_URL to the local Mailpit the worker sends through.',
  );

  test('resets from the emailed link once, without leaking the link', async ({ page, request }) => {
    const owner = await registerOwner(request);
    const newPassword = `reset-e2e-password-${uniqueId()}`;

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    // The URL changes before the route renders; wait for the new form.
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
    await page.getByLabel('Email').fill(owner.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText(`If an account uses ${owner.email}`);

    const resetEmail = await waitForEmail(request, owner.email, 'Reset your Weaver password');
    const link = resetEmail.match(/\S+\/reset-password\/([a-f0-9]{96})/);
    expect(link, 'the email carries a reset link').not.toBeNull();
    const [, token] = link!;
    expect(resetEmail).toContain('expires in 30 minutes');

    const leaks: string[] = [];
    page.on('request', (sent) => {
      if ((sent.headers().referer ?? '').includes(token)) leaks.push(sent.url());
    });
    await page.goto(`/reset-password/${token}`);
    await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible();
    await expect(page).toHaveURL(/\/reset-password$/);

    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('status')).toContainText('Your password was changed.');
    expect(leaks, 'requests that carried the reset token in Referer').toEqual([]);

    const changedEmail = await waitForEmail(
      request,
      owner.email,
      'Your Weaver password was changed',
    );
    expect(changedEmail).toContain('/forgot-password');

    await page.getByLabel('Email').fill(owner.email);
    await page.getByLabel('Password').fill(owner.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid email or password. Please try again.')).toBeVisible();
    await page.getByLabel('Password').fill(newPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/projects$/);

    await page.goto(`/reset-password/${token}`);
    await page.getByLabel('New password', { exact: true }).fill('another-password-123');
    await page.getByLabel('Confirm new password').fill('another-password-123');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'This reset link is invalid, expired, or already used.',
    );
  });

  test('an unknown address sees the same confirmation and gets no email', async ({
    page,
    request,
  }) => {
    const email = `nobody-${uniqueId()}@example.invalid`;
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText(`If an account uses ${email}`);
    await page.waitForTimeout(2_000);
    expect(await countEmails(request, email)).toBe(0);
  });
});
