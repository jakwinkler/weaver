import type { BrowserContext } from '@playwright/test';
import { test, expect, apiCall, apiBaseUrl, createProject, createIssue, uniqueId } from './fixtures';

test('clients see project colleagues in assignees and mentions while agency staff retain the full directory', async ({ browser, context, owner }) => {
  await createProject(context, owner);
  await createProject(context, owner, { key: 'OTHER', name: 'Other client project' });
  await createIssue(context, owner);
  const contexts: BrowserContext[] = [];
  const people: Record<string, { id: string; email: string; context: typeof context }> = {};
  try {
    for (const [name, role] of [['Client', 'member'], ['Hidden Client', 'viewer'], ['Agency', 'member']] as const) {
      const email = `privacy-${uniqueId()}@example.invalid`;
      const invitation = await apiCall(context, owner, 'post', '/users/invitations', { email, role });
      expect(invitation.status()).toBe(201);
      const { token } = await invitation.json();
      const personContext = await browser.newContext(); contexts.push(personContext);
      const joined = await personContext.request.post(`${apiBaseUrl}/auth/invitations/${token}/accept`, { data: { email, password: 'local-privacy-password-123', displayName: name } });
      expect(joined.status()).toBe(201);
      people[name] = { id: (await joined.json()).user.id, email, context: personContext };
    }
    expect((await apiCall(context, owner, 'patch', `/users/${people.Agency.id}/role`, { role: 'admin' })).status()).toBe(200);
    expect((await apiCall(context, owner, 'post', '/projects/TEST/members', { userId: people.Client.id, role: 'member' })).status()).toBe(201);
    expect((await apiCall(context, owner, 'post', '/projects/OTHER/members', { userId: people['Hidden Client'].id, role: 'viewer' })).status()).toBe(201);
    const clientPage = await people.Client.context.newPage();
    await clientPage.goto('/login');
    await clientPage.getByLabel('Email').fill(people.Client.email);
    await clientPage.getByLabel('Password').fill('local-privacy-password-123');
    await clientPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(clientPage.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
    await clientPage.goto('/issues/TEST-1');
    await clientPage.getByRole('button', { name: 'Unassigned', exact: true }).click();
    await expect(clientPage.getByRole('menuitem', { name: new RegExp(owner.displayName) })).toBeVisible();
    await expect(clientPage.getByRole('menuitem', { name: /Hidden Client|Agency/ })).toHaveCount(0);
    await clientPage.keyboard.press('Escape');
    const editor = clientPage.getByLabel('Add a comment...', { exact: true });
    await editor.pressSequentially('@');
    const suggestions = clientPage.getByRole('listbox', { name: 'Mention a person' });
    await expect(suggestions.getByRole('option', { name: owner.displayName, exact: true })).toBeVisible();
    await expect(suggestions.getByRole('option', { name: /Hidden Client|Agency/ })).toHaveCount(0);
    const agencyPage = await people.Agency.context.newPage();
    await agencyPage.goto('/login');
    await agencyPage.getByLabel('Email').fill(people.Agency.email);
    await agencyPage.getByLabel('Password').fill('local-privacy-password-123');
    await agencyPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(agencyPage.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
    await agencyPage.goto('/admin/users');
    for (const person of Object.values(people)) await expect(agencyPage.getByText(person.email, { exact: true })).toBeVisible();
  } finally { for (const ctx of contexts) await ctx.close(); }
});
