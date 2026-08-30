import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';

describe('apiClient authentication headers', () => {
  beforeEach(() => {
    const values: Record<string, string> = {
      accessToken: 'existing-access-token',
      tenantId: 'existing-tenant-id',
    };
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values[key] ?? null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not send an existing session during the OAuth cookie handoff', async () => {
    let authorization: string | undefined;
    let tenantId: string | undefined;
    apiClient.defaults.adapter = async (config) => {
      authorization = config.headers.get('Authorization') as string | undefined;
      tenantId = config.headers.get('x-tenant-id') as string | undefined;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    await apiClient.get('/auth/session');

    expect(authorization).toBeUndefined();
    expect(tenantId).toBeUndefined();
  });

  it('continues to send the current session to protected API routes', async () => {
    let authorization: string | undefined;
    let tenantId: string | undefined;
    apiClient.defaults.adapter = async (config) => {
      authorization = config.headers.get('Authorization') as string | undefined;
      tenantId = config.headers.get('x-tenant-id') as string | undefined;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };

    await apiClient.get('/projects');

    expect(authorization).toBe('Bearer existing-access-token');
    expect(tenantId).toBe('existing-tenant-id');
  });
});
