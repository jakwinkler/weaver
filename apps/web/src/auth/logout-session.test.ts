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
    window.localStorage.setItem('weaver:comment-draft:tenant-1:user-1:ISSUE-1', '{}');

    await endSession({ clear } as never);

    expect(clear).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().tenantId).toBeNull();
    expect(window.localStorage.getItem('tenantId')).toBeNull();
    expect(
      window.localStorage.getItem('weaver:comment-draft:tenant-1:user-1:ISSUE-1'),
    ).toBeNull();
  });

  it('removes saved workflow editor layouts but keeps device preferences', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({});
    window.localStorage.setItem('weaver:workflow-positions:workflow-1', '{}');
    window.localStorage.setItem('weaver:workflow-edge-waypoints:workflow-1', '{}');
    window.localStorage.setItem('weaver:workflow-edge-handles:workflow-1', '{}');
    window.localStorage.setItem('weaver:perPage', '50');

    await endSession({ clear: vi.fn() } as never);

    expect(window.localStorage.getItem('weaver:workflow-positions:workflow-1')).toBeNull();
    expect(window.localStorage.getItem('weaver:workflow-edge-waypoints:workflow-1')).toBeNull();
    expect(window.localStorage.getItem('weaver:workflow-edge-handles:workflow-1')).toBeNull();
    expect(window.localStorage.getItem('weaver:perPage')).toBe('50');
  });
});
