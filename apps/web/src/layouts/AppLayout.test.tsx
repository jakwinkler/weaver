// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { adminNavItems, AppLayout } from './AppLayout';

const storeMocks = vi.hoisted(() => ({
  logout: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock('@/api', () => ({
  useAvailablePlugins: () => ({ data: [] }),
  useInstalledPlugins: () => ({ data: [] }),
  useMyPermissions: () => ['*'],
  useProjects: () => ({ data: { data: [] } }),
  useUnreadCount: () => ({ data: 0 }),
}));

vi.mock('@/stores', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      isAdmin: () => false,
      logout: storeMocks.logout,
      user: { displayName: 'Matt', email: 'matt@example.com' },
    }),
  useThemeStore: (selector: (state: unknown) => unknown) =>
    selector({ theme: 'light', setTheme: storeMocks.setTheme }),
}));

vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: vi.fn() }));

Object.defineProperty(Element.prototype, 'hasPointerCapture', {
  configurable: true,
  value: () => false,
});
Object.defineProperty(Element.prototype, 'setPointerCapture', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(Element.prototype, 'releasePointerCapture', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});

function LocationDisplay() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function SearchFixture() {
  return <input data-shortcut-search aria-label="Search fixture" />;
}

function ProjectFixture() {
  return (
    <div>
      <input aria-label="Project editor" />
      <Outlet />
    </div>
  );
}

function renderLayout(initialEntry = '/projects/TEST/board') {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationDisplay />
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<div>Dashboard fixture</div>} />
            <Route path="/projects" element={<div>Projects fixture</div>} />
            <Route path="/projects/:projectKey" element={<ProjectFixture />}>
              <Route path="board" element={<div>Board fixture</div>} />
              <Route path="issues" element={<div>Issues fixture</div>} />
            </Route>
            <Route path="/search" element={<SearchFixture />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('AppLayout global keyboard shortcuts', () => {
  it('opens shortcut help and creates an issue in the active project', () => {
    renderLayout();

    fireEvent.keyDown(document, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.keyDown(document, { key: 'c' });
    expect(screen.getByTestId('location')).toHaveTextContent('/projects/TEST/issues?create=1');
  });

  it('navigates global sequences to real routes', () => {
    renderLayout();

    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'p' });
    expect(screen.getByTestId('location')).toHaveTextContent('/projects');

    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'd' });
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('moves to search and focuses the search field', async () => {
    renderLayout();

    fireEvent.keyDown(document, { key: '/' });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/search');
      expect(screen.getByLabelText('Search fixture')).toHaveFocus();
    });
  });

  it('does not fire shortcuts while typing in a project field', () => {
    renderLayout('/projects/TEST');
    const input = screen.getByLabelText('Project editor');

    fireEvent.keyDown(input, { key: 'c' });

    expect(screen.getByTestId('location')).toHaveTextContent('/projects/TEST');
  });
});

describe('AppLayout responsive shell', () => {
  it('collapses the desktop sidebar and keeps a mobile home link', () => {
    renderLayout('/');

    const sidebar = document.querySelector('aside');
    expect(sidebar).toHaveClass('hidden', 'md:flex');
    expect(screen.getByRole('link', { name: 'Weaver home mobile' })).toHaveClass('md:hidden');
    expect(screen.getByRole('main')).toHaveClass('px-4', 'sm:px-6');
  });
});

describe('AppLayout admin navigation', () => {
  it('links administrators to the Jira import wizard', () => {
    expect(adminNavItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          to: '/settings/import-export',
          label: 'Import / Export',
        }),
      ]),
    );
  });
});
