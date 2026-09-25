import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { it, expect, vi } from 'vitest';
import { OAuthCallback } from './OAuthCallback';
import { useAuthStore } from '@/stores';
vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi
      .fn()
      .mockResolvedValue({ data: { tenantId: 'tenant', user: { id: 'user', role: 'owner' } } }),
  },
}));
it('restores the role and tenant from the cookie-backed profile without new tokens', async () => {
  useAuthStore.getState().logout();
  render(
    <MemoryRouter initialEntries={['/auth/callback']}>
      <Routes>
        <Route path="/auth/callback" element={<OAuthCallback />} />
        <Route path="/projects" element={<p>Projects ready</p>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText('Projects ready')).toBeTruthy();
  expect(useAuthStore.getState().isAdmin()).toBe(true);
  expect(useAuthStore.getState().accessToken).toBeNull();
  expect(localStorage.getItem('refreshToken')).toBeNull();
});
