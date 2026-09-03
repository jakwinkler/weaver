// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores';
import { endSession } from './logout-session';

describe('endSession', () => {
  beforeEach(() => {
    window.localStorage.setItem('tenantId', 'tenant-1');
    useAuthStore.setState({ tenantId: 'tenant-1' });
  });

  it('clears auth state and cached tenant data even when logout fails', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('offline'));
    const clear = vi.fn();

    await endSession({ clear } as never);

    expect(clear).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().tenantId).toBeNull();
    expect(window.localStorage.getItem('tenantId')).toBeNull();
  });
});
