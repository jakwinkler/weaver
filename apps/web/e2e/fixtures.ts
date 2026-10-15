import { randomBytes } from 'node:crypto';
import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export const apiBaseUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3000/api/v1';
const webBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

for (const target of [apiBaseUrl, webBaseUrl]) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(target).hostname)) {
    throw new Error('The write-capable browser suite requires local web and API URLs.');
  }
}

export interface Owner {
  email: string;
  password: string;
  tenantId: string;
  displayName: string;
}

export function uniqueId(): string {
  return randomBytes(6).toString('hex');
}

export async function registerOwner(request: APIRequestContext): Promise<Owner> {
  const id = uniqueId();
  const owner = {
    email: `e2e-${id}@example.invalid`,
    password: 'local-e2e-password-123',
    displayName: `Test Owner ${id}`,
  };
  let response: APIResponse | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await request.post(`${apiBaseUrl}/auth/register`, {
      data: {
        ...owner,
        orgName: `E2E ${id}`,
        orgSlug: `e2e-${id}`,
      },
    });
    if (response.status() !== 429) break;
    const retryAfter = Number((await response.json() as { retryAfter?: number }).retryAfter);
    await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(retryAfter) ? retryAfter : 60) * 1000 + 250));
  }
  if (!response) throw new Error('Registration request was not sent');
  expect(response.status(), 'register a disposable local tenant').toBe(201);
  const result = await response.json();
  return { ...owner, tenantId: result.tenantId };
}

export async function apiCall(
  context: BrowserContext,
  owner: Owner,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  data?: unknown,
) {
  return context.request[method](`${apiBaseUrl}${path}`, {
    headers: { 'x-tenant-id': owner.tenantId },
    ...(data === undefined ? {} : { data }),
  });
}

export async function createProject(
  context: BrowserContext,
  owner: Owner,
  options: { name?: string; key?: string } = {},
) {
  const response = await apiCall(context, owner, 'post', '/projects', {
    name: options.name ?? 'E2E Project',
    key: options.key ?? 'TEST',
  });
  expect(response.status(), 'create a project in the disposable tenant').toBe(201);
  return response.json();
}

export async function createIssue(
  context: BrowserContext,
  owner: Owner,
  projectKey = 'TEST',
  options: { summary?: string; priority?: string } = {},
) {
  const response = await apiCall(context, owner, 'post', `/projects/${projectKey}/issues`, {
    summary: options.summary ?? 'E2E issue',
    priority: options.priority ?? 'medium',
    labels: [],
    customFields: {},
    percentDone: 0,
  });
  expect(response.status(), 'create an issue in the disposable tenant').toBe(201);
  return response.json();
}

export async function openProjects(page: Page): Promise<void> {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
}

export const test = base.extend<{ owner: Owner }>({
  owner: [async ({ page }, use) => {
    const owner = await registerOwner(page.context().request);
    await page.goto('/login');
    await page.evaluate((tenantId) => {
      localStorage.setItem('tenantId', tenantId);
    }, owner.tenantId);
    await use(owner);
  }, { auto: true }],
});

export { expect };
