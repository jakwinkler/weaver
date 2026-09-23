// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayout } from './AppLayout';

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { displayName: 'Review User', email: 'review@local.test' },
      isAdmin: () => false,
      logout: vi.fn(),
    }),
  useThemeStore: (selector: (state: unknown) => unknown) =>
    selector({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/api', () => ({
  useProjects: () => ({ data: { data: [] } }),
  useUnreadCount: () => ({ data: 0 }),
  useInstalledPlugins: () => ({ data: [] }),
  useAvailablePlugins: () => ({ data: [] }),
  useMyPermissions: () => [],
}));

vi.mock('@/features/projects/ProjectSettingsPage', () => ({
  ProjectIcon: () => null,
}));
vi.mock('@/components/UserAvatar', () => ({ UserAvatar: () => null }));
vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: vi.fn() }));
vi.mock('@/plugins/plugin-slot-registry', () => ({ getNavigationEntries: () => [] }));
vi.mock('@/plugins/plugin-icons', () => ({ getPluginIcon: () => () => null }));

describe('AppLayout responsive shell', () => {
  it('collapses the desktop sidebar and keeps a mobile home link', () => {
    render(
      <TooltipProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<div>Review content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>,
    );

    const sidebar = document.querySelector('aside');
    expect(sidebar).toHaveClass('hidden', 'md:flex');
    expect(screen.getByRole('link', { name: 'Weaver home mobile' })).toHaveClass('md:hidden');
    expect(screen.getByRole('main')).toHaveClass('px-4', 'sm:px-6');
  });
});
