// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores';
import { AppLayout } from './AppLayout';

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
  useCurrentUser: () => ({ data: currentUser }),
  useProjects: () => ({ data: { data: [] } }),
  useUnreadCount: () => ({ data: 0 }),
  useInstalledPlugins: () => ({ data: [] }),
  useAvailablePlugins: () => ({ data: [] }),
  useMyPermissions: () => ['*'],
  useUploadAttachment: () => ({ mutateAsync: vi.fn() }),
  useGenericUploadAttachment: () => ({ mutateAsync: vi.fn() }),
  getAttachmentUrl: (id: string) => `/attachments/${id}`,
}));

vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: vi.fn() }));

function renderLayout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/projects']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/projects" element={<p>Projects content</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('AppLayout', () => {
  afterEach(() => {
    cleanup();
    useAuthStore.setState({ user: null, role: null });
  });

  it('provides a collapsible primary navigation for narrow screens', () => {
    const view = renderLayout();

    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    const navigation = screen.getByLabelText('Primary navigation');
    expect(navigation.className).toContain('-translate-x-full');
    expect(navigation.className).toContain('invisible');

    fireEvent.click(toggle);
    expect(navigation.className).toContain('translate-x-0');
    expect(navigation.className).toContain('visible');
    expect(within(navigation).getByRole('button', { name: 'Close navigation' })).toBeTruthy();
    expect(view.container.firstElementChild?.className).toContain('min-w-0');
  });

  it('uses the active theme surface and foreground tokens', () => {
    const view = renderLayout();

    expect(view.container.firstElementChild?.className).toContain('bg-background');
    expect(view.container.firstElementChild?.className).toContain('text-foreground');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeTruthy();
  });
});
