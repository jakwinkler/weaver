import { test, expect, apiCall, createIssue, createProject, apiBaseUrl, registerOwner } from './fixtures';

test('invited member joins the same organization and sees shared work', async ({ browser, page, context, owner }) => {
  await createProject(context, owner);
  await createIssue(context, owner, 'TEST', { summary: 'Shared pilot issue' });
  const email = `member-${Date.now()}@example.invalid`;
  const inviteResponse = await apiCall(context, owner, 'post', '/users/invitations', { email, role: 'member' });
  expect(inviteResponse.status()).toBe(201);
  const invite = await inviteResponse.json() as { token: string };
  expect(invite.token).toMatch(/^[a-f0-9]{64}$/);

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(`/invite/${invite.token}`);
  await expect(memberPage.getByText(email)).toBeVisible();
  await memberPage.getByLabel('Display Name').fill('Pilot Member');
  await memberPage.getByLabel('Password').fill('pilot-password-123');
  await memberPage.getByRole('button', { name: 'Join organization' }).click();
  await expect(memberPage.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  const members = await apiCall(context, owner, 'get', '/users');
  const member = (await members.json() as { id: string; email: string; role: string }[])
    .find((entry) => entry.email === email);
  expect(member?.role).toBe('member');
  await page.goto('/projects/TEST/settings');
  await page.getByRole('tab', { name: 'Members' }).click();
  await page.getByRole('button', { name: 'Add Member' }).click();
  await page.getByLabel('User').selectOption(member!.id);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await memberPage.goto('/projects/TEST/issues');
  await expect(memberPage.getByText('Shared pilot issue')).toBeVisible();
  await memberPage.getByRole('link', { name: 'TEST-1', exact: true }).click();
  await expect(memberPage.getByRole('button', { name: 'To Do', exact: true })).toBeVisible();
  await memberPage.getByRole('button', { name: 'To Do', exact: true }).click();
  await memberPage.getByRole('menuitem', { name: 'In Progress', exact: true }).click();
  await expect(memberPage.getByRole('button', { name: 'In Progress', exact: true })).toBeVisible();
  await memberPage.reload();
  await expect(memberPage.getByRole('button', { name: 'In Progress', exact: true })).toBeVisible();
  await memberContext.close();
});

test('invitation is single use and bound to its email', async ({ browser, context, owner }) => {
  const email = `invite-${Date.now()}@example.invalid`;
  const created = await apiCall(context, owner, 'post', '/users/invitations', { email, role: 'member' });
  expect(created.status()).toBe(201);
  const { token } = await created.json() as { token: string };

  const inviteeContext = await browser.newContext();
  const wrongEmail = await inviteeContext.request.post(`${apiBaseUrl}/auth/invitations/${token}/accept`, {
    data: { email: 'someone-else@example.invalid', displayName: 'Wrong User', password: 'pilot-password-123' },
  });
  expect(wrongEmail.status()).toBe(400);
  const accepted = await inviteeContext.request.post(`${apiBaseUrl}/auth/invitations/${token}/accept`, {
    data: { email, displayName: 'Right User', password: 'pilot-password-123' },
  });
  expect(accepted.status()).toBe(201);
  expect((await accepted.json()).tenantId).toBe(owner.tenantId);
  const replay = await inviteeContext.request.post(`${apiBaseUrl}/auth/invitations/${token}/accept`, {
    data: { email, displayName: 'Right User', password: 'pilot-password-123' },
  });
  expect(replay.status()).toBe(401);
  await inviteeContext.close();
});

test('a member cannot create invitations for the organization', async ({ browser, context, owner }) => {
  const otherContext = await browser.newContext();
  await registerOwner(otherContext.request);
  const response = await otherContext.request.post(`${apiBaseUrl}/users/invitations`, {
    headers: { 'x-tenant-id': owner.tenantId },
    data: { email: 'outsider@example.invalid', role: 'member' },
  });
  expect(response.status()).toBe(403);
  await otherContext.close();
});

test('an existing account needs its password and can switch between organizations', async ({ browser, context, owner }) => {
  await createProject(context, owner, { name: 'Invited organization project', key: 'INV' });
  const existingContext = await browser.newContext();
  const existing = await registerOwner(existingContext.request);
  const created = await apiCall(context, owner, 'post', '/users/invitations', {
    email: existing.email,
    role: 'viewer',
  });
  expect(created.status()).toBe(201);
  const { token } = await created.json() as { token: string };
  const invitationInfo = await existingContext.request.get(`${apiBaseUrl}/auth/invitations/${token}`);
  expect(invitationInfo.status()).toBe(200);
  const organizationName = (await invitationInfo.json() as { organizationName: string }).organizationName;

  const invalid = await existingContext.request.post(`${apiBaseUrl}/auth/invitations/${token}/accept`, {
    data: { email: existing.email, displayName: existing.displayName, password: 'wrong-password' },
  });
  expect(invalid.status()).toBe(401);
  const accepted = await existingContext.request.post(`${apiBaseUrl}/auth/invitations/${token}/accept`, {
    data: { email: existing.email, displayName: existing.displayName, password: existing.password },
  });
  expect(accepted.status()).toBe(201);
  expect((await accepted.json()).tenantId).toBe(owner.tenantId);
  const membersResponse = await apiCall(context, owner, 'get', '/users');
  const invitedUser = (await membersResponse.json() as { id: string; email: string }[])
    .find((user) => user.email === existing.email);
  expect(invitedUser).toBeTruthy();
  const addedToProject = await apiCall(context, owner, 'post', '/projects/INV/members', {
    userId: invitedUser!.id,
    role: 'viewer',
  });
  expect(addedToProject.status()).toBe(201);

  const originalOrg = await existingContext.request.post(`${apiBaseUrl}/auth/login`, {
    data: { email: existing.email, password: existing.password, tenantId: existing.tenantId },
  });
  expect(originalOrg.status()).toBe(201);
  const organizationsResponse = await existingContext.request.get(`${apiBaseUrl}/auth/organizations`);
  expect(organizationsResponse.status()).toBe(200);
  const organizations = await organizationsResponse.json() as { tenantId: string; name: string }[];
  const originalOrganizationName = organizations.find((organization) => organization.tenantId === existing.tenantId)?.name;
  expect(originalOrganizationName).toBeTruthy();
  await existingContext.request.post(`${apiBaseUrl}/auth/logout`);
  const existingPage = await existingContext.newPage();
  await existingPage.goto('/login');
  await existingPage.getByLabel('Email').fill(existing.email);
  await existingPage.getByLabel('Password').fill(existing.password);
  await existingPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(existingPage).toHaveURL(/\/projects$/);
  await existingPage.getByRole('button', { name: 'Account menu' }).click();
  await expect(existingPage.getByRole('menuitem', { name: `Switch to ${organizationName}` })).toBeVisible();
  await existingContext.clearCookies({ name: 'weaver_token' });
  await existingPage.getByRole('menuitem', { name: `Switch to ${organizationName}` }).click();
  await expect.poll(() => existingPage.evaluate(() => localStorage.getItem('tenantId'))).toBe(owner.tenantId);
  await expect(existingPage.getByRole('link', { name: /Invited organization project/ }).last()).toBeVisible();
  await expect(existingPage.getByRole('button', { name: 'Create Project' })).toHaveCount(0);
  await existingPage.getByRole('button', { name: 'Account menu' }).click();
  await existingPage.getByRole('menuitem', { name: `Switch to ${originalOrganizationName}` }).click();
  await expect.poll(() => existingPage.evaluate(() => localStorage.getItem('tenantId'))).toBe(existing.tenantId);
  await expect(existingPage.getByRole('link', { name: /Invited organization project/ })).toHaveCount(0);
  await expect(existingPage.getByRole('button', { name: 'Create Project' })).toBeVisible();
  await existingContext.close();
});
