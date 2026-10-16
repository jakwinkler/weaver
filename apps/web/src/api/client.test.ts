import axios, { AxiosError } from 'axios';
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

    expect(authorization).toBeUndefined();
    expect(apiClient.defaults.withCredentials).toBe(true);
    expect(tenantId).toBe('existing-tenant-id');
  });
});

describe('apiClient session refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes once when concurrent requests keep returning 401', async () => {
    let finishFirstRefresh!: () => void;
    const refresh = vi
      .spyOn(axios, 'post')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirstRefresh = () => resolve({ data: {} });
          }),
      )
      .mockResolvedValue({ data: {} });
    let attempts = 0;
    apiClient.defaults.adapter = async (config) => {
      attempts += 1;
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        data: {},
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      });
    };

    const requests = Promise.allSettled([
      apiClient.get('/projects'),
      apiClient.get('/issues'),
      apiClient.get('/sprints'),
    ]);
    // Hold the refresh open until every request has failed once and joined the queue.
    await vi.waitFor(() => expect(attempts).toBe(3));
    finishFirstRefresh();
    const results = await requests;

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected', 'rejected']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/refresh$/), {}, {
      withCredentials: true,
    });
    expect(attempts).toBe(6);
  });
});
