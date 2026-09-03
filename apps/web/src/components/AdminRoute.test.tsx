// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores';
import { AdminRoute } from './AdminRoute';

const currentUser = {
  id: 'user-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  authProvider: 'local' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  role: 'owner',
};

vi.mock('@/api', () => ({
  useCurrentUser: () => ({ data: currentUser, isLoading: false, isError: false }),
}));

describe('AdminRoute', () => {
  afterEach(() => {
    cleanup();
    useAuthStore.setState({ user: null, role: null });
  });

  it('uses the authoritative current user when opening an admin deep link', () => {
    useAuthStore.setState({ user: null, role: null, tenantId: 'tenant-1' });

    render(
      <MemoryRouter initialEntries={['/admin/teams']}>
        <Routes>
          <Route element={<AdminRoute />}>
            <Route path="/admin/teams" element={<p>Admin teams</p>} />
          </Route>
          <Route path="/projects" element={<p>Projects redirect</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Admin teams')).toBeTruthy();
    expect(screen.queryByText('Projects redirect')).toBeNull();
  });
});
