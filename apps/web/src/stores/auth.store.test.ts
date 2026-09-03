// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './auth.store';

const ACCESS_TOKEN =
  'header.' + btoa(JSON.stringify({ role: 'owner' })) + '.signature';

describe('auth token storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      tenantId: null,
      role: null,
    });
  });

  it('keeps credentials out of browser storage', () => {
    useAuthStore.getState().login(
      ACCESS_TOKEN,
      {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        authProvider: 'local',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      'tenant-1',
    );

    expect(window.localStorage.getItem('accessToken')).toBeNull();
    expect(window.localStorage.getItem('refreshToken')).toBeNull();
    expect(window.localStorage.getItem('tenantId')).toBe('tenant-1');
  });
});
