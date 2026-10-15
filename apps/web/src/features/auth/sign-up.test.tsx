// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/api/client';
import { OrgPicker } from './OrgPicker';
import { RegisterPage } from './RegisterPage';

vi.mock('@/api/client', () => ({
  API_BASE_URL: '/api/v1',
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(apiClient.get);
const post = vi.mocked(apiClient.post);
let oauthContext: Record<string, unknown>;

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/auth/organizations" element={<OrgPicker />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  oauthContext = {
    user: { id: 'u1', email: 'new@example.com' },
    provider: 'google',
    blockedOrganizationCount: 0,
    organizations: [],
  };
  get.mockImplementation(async (url: string) => {
    if (url === '/auth/providers') return { data: { google: true, github: true } };
    if (url === '/auth/oauth-context') return { data: oauthContext };
    throw new Error(`Unexpected GET ${url}`);
  });
});

afterEach(cleanup);

describe('Register page', () => {
  it('offers Google and GitHub sign-up before the email form', async () => {
    renderAt('/register');
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/v1/auth/google',
    );
    expect(screen.getByRole('link', { name: 'Continue with GitHub' })).toBeInTheDocument();
    expect(
      screen.getByText('Sign up with Google or GitHub, then name your organization.'),
    ).toBeInTheDocument();
  });

  it('points an existing address to sign-in and password reset', async () => {
    post.mockRejectedValue(
      Object.assign(new Error('conflict'), {
        isAxiosError: true,
        response: { status: 409, data: { message: 'A user with this email already exists' } },
      }),
    );
    renderAt('/register');
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Pat' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'pat@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password-123' } });
    fireEvent.change(screen.getByLabelText('Organization Name'), { target: { value: 'Pat Co' } });
    fireEvent.change(screen.getByLabelText('Organization Slug'), { target: { value: 'pat-co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An account with this email already exists.');
    expect(screen.getByRole('link', { name: 'reset your password' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });
});

describe('Organization step after Google or GitHub', () => {
  it('tells a new account what happens next and how to join an existing team instead', async () => {
    renderAt('/auth/organizations');
    expect(await screen.findByText('Create your organization')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your Weaver account for new@example.com is ready. Name your organization to finish.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ask its owner to invite new@example.com/)).toBeInTheDocument();
  });

  it('sends existing members whose organizations turned the provider off back to sign-in', async () => {
    oauthContext = { ...oauthContext, blockedOrganizationCount: 2 };
    renderAt('/auth/organizations');
    expect(await screen.findByText('Sign in another way')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      "Your account already belongs to 2 organizations that don't allow Google sign-in.",
    );
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByText('Or create a new organization')).toBeInTheDocument();
  });
});
