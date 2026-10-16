// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Outlet, Link } from 'react-router-dom';
import { FormBuilder } from './features/forms/FormBuilder';

vi.mock('@/components/ProtectedRoute', () => ({ ProtectedRoute: () => <Outlet /> }));
vi.mock('@/components/AdminRoute', () => ({ AdminRoute: () => <Outlet /> }));
vi.mock('@/layouts/AppLayout', () => ({ AppLayout: () => <Outlet /> }));
vi.mock('@/features/projects/ProjectSettingsPage', () => ({
  ProjectSettingsPage: () => (
    <>
      <FormBuilder projectKey="EPD" />
      <Link to="/projects">Leave project</Link>
    </>
  ),
}));
vi.mock('@/features/projects/ProjectsPage', () => ({
  ProjectsPage: () => <h1>Projects destination</h1>,
}));
vi.mock('@/features/auth/ForgotPasswordPage', () => ({
  ForgotPasswordPage: () => <h1>Forgot password destination</h1>,
}));
vi.mock('@/features/auth/ResetPasswordPage', () => ({
  ResetPasswordPage: () => <h1>Reset password destination</h1>,
}));
vi.mock('@/api', () => ({
  useForms: () => ({ data: [], isLoading: false, isError: false }),
  useProjectIssueTypes: () => ({ data: [] }),
  useCreateForm: () => ({ mutateAsync: vi.fn() }),
  useUpdateForm: () => ({ mutateAsync: vi.fn() }),
  useDeleteForm: () => ({ mutateAsync: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let App: (typeof import('./App'))['App'];
beforeAll(async () => {
  window.history.replaceState({}, '', '/projects/EPD/settings');
  ({ App } = await import('./App'));
}, 30000);

describe('Forms in the application router', () => {
  it('opens the Forms editor on a project settings URL without a router error', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    render(<App />);
    expect(await screen.findByRole('button', { name: 'New' })).toBeTruthy();
    expect(screen.queryByText(/couldn’t be displayed/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(screen.getByLabelText('Form name'), {
      target: { value: 'Unsaved private draft' },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('link', { name: 'Leave project' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('Discard your unsaved form changes?'));
    expect((screen.getByLabelText('Form name') as HTMLInputElement).value).toBe(
      'Unsaved private draft',
    );
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('link', { name: 'Leave project' }));
    await screen.findByRole('heading', { name: 'Projects destination' });
  });

  it.each([
    ['/forgot-password', 'Forgot password destination'],
    ['/reset-password', 'Reset password destination'],
    ['/reset-password/token', 'Reset password destination'],
  ])('keeps the password reset route %s available', async (path, heading) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    render(<App />);
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
  });
});
