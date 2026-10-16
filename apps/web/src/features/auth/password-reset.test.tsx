// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { LoginPage } from './LoginPage';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('@/api/client', () => ({
  API_BASE_URL: '/api/v1',
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
const TOKEN = `${'a'.repeat(32)}${'b'.repeat(64)}`;

function httpError(status: number, data: Record<string, unknown> = {}) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

function renderAt(path: string) {
  window.history.replaceState(null, '', path);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillNewPassword(password: string, repeat = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: repeat } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/auth/providers') return { data: { google: true, github: false } };
    throw new Error(`Unexpected GET ${url}`);
  });
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('Forgot password page', () => {
  it('shows the same confirmation whatever the server knows about the address', async () => {
    post.mockResolvedValue({ data: { message: 'generic' } });
    renderAt('/forgot-password');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'someone@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'If an account uses someone@example.com, we sent it a link to reset the password.',
    );
    expect(post).toHaveBeenCalledWith('/auth/password-reset/request', {
      email: 'someone@example.com',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('explains a throttled request', async () => {
    post.mockRejectedValue(httpError(429));
    renderAt('/forgot-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'someone@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait 15 minutes');
  });
});

describe('Reset password page', () => {
  it('removes the token from the address bar and refuses to send a Referer', () => {
    const view = renderAt(`/reset-password/${TOKEN}`);

    expect(window.location.pathname).toBe('/reset-password');
    expect(window.location.href).not.toContain(TOKEN);
    expect(document.head.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe(
      'no-referrer',
    );

    view.unmount();
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
  });

  it('checks that both passwords match before calling the server', () => {
    renderAt(`/reset-password/${TOKEN}`);
    fillNewPassword('new-password-1', 'new-password-2');
    expect(screen.getByRole('alert')).toHaveTextContent("The passwords don't match.");
    expect(post).not.toHaveBeenCalled();
  });

  it('changes the password and sends the person to sign in with a notice', async () => {
    post.mockResolvedValue({ data: { message: 'changed' } });
    renderAt(`/reset-password/${TOKEN}`);
    fillNewPassword('new-password-1');

    expect(
      await screen.findByText('Your password was changed. Sign in with your new password.'),
    ).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/auth/password-reset/confirm', {
      token: TOKEN,
      password: 'new-password-1',
    });
  });

  it('offers a new link when the server rejects this one', async () => {
    post.mockRejectedValue(httpError(400, { message: 'invalid' }));
    renderAt(`/reset-password/${TOKEN}`);
    fillNewPassword('new-password-1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This reset link is invalid, expired, or already used.',
    );
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe(
      '/forgot-password',
    );
  });

  it('asks for the emailed link again after a reload', () => {
    renderAt('/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Open the reset link from your email again.',
    );
    expect(screen.queryByLabelText('New password')).toBeNull();
  });
});

describe('Sign-in page', () => {
  it('links to password reset and says that social sign-in also creates accounts', async () => {
    renderAt('/login');

    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe(
      '/forgot-password',
    );
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Continue with GitHub' })).toBeNull();
    expect(screen.getByText(/Either button also creates your account/)).toBeTruthy();
  });

  it('tells a throttled person to wait instead of blaming their password', async () => {
    post.mockRejectedValueOnce(httpError(429)).mockRejectedValueOnce(httpError(401));
    renderAt('/login');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many sign-in attempts');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'),
    );
  });
});
