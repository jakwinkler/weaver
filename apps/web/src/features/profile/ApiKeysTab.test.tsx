// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiKeysTab } from './ApiKeysTab';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createReset: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/api/hooks-profile', () => ({
  useApiKeys: () => ({
    data: [
      {
        id: 'key-1',
        name: 'Deploy key',
        maskedKey: 'wvr_••••••••••••',
        scopes: ['read', 'write'],
        expiresAt: null,
        lastUsedAt: null,
        createdAt: '2026-08-29T12:00:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useCreateApiKey: () => ({
    mutateAsync: mocks.create,
    reset: mocks.createReset,
    isPending: false,
    isError: false,
  }),
  useDeleteApiKey: () => ({
    mutateAsync: mocks.delete,
    isPending: false,
    isError: false,
    variables: undefined,
  }),
}));

describe('ApiKeysTab', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  beforeEach(() => {
    mocks.create.mockReset();
    mocks.createReset.mockReset();
    mocks.delete.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('lists and deletes a masked API key after confirmation', async () => {
    render(<ApiKeysTab />);

    expect(screen.getByText('Deploy key')).toBeTruthy();
    expect(screen.getByText('wvr_••••••••••••')).toBeTruthy();
    expect(screen.queryByText('wvr_super-secret')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Deploy key' }));

    await waitFor(() => {
      expect(mocks.delete).toHaveBeenCalledWith('key-1');
    });
    expect(window.confirm).toHaveBeenCalledOnce();
  });

  it('shows a newly created key once and clears it when the dialog closes', async () => {
    const plainKey = `wvr_${'a'.repeat(40)}`;
    mocks.create.mockResolvedValue({
      id: 'key-2',
      name: 'CI key',
      maskedKey: 'wvr_••••••••••••',
      scopes: ['read'],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: '2026-08-29T12:00:00.000Z',
      key: plainKey,
    });

    render(<ApiKeysTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Create new key' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'CI key' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith({
        name: 'CI key',
        scopes: ['read'],
        expiresAt: null,
      });
    });
    expect(await screen.findByText(/This will only be shown once/)).toBeTruthy();
    expect(screen.getByDisplayValue(plainKey)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(screen.queryByDisplayValue(plainKey)).toBeNull();
    });
    expect(mocks.createReset).toHaveBeenCalled();
  });
});
