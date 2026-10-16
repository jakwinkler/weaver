vi.mock('@/api/client', () => ({
  apiClient: {
    post: vi.fn().mockResolvedValue({
      data: {
        projects: [
          { key: 'ONE', issues: 2, comments: 3, attachments: 0, worklogs: 1, securedIssues: 0 },
        ],
        notes: [],
      },
    }),
  },
}));
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportWizard } from './ImportWizard';

const discover = {
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  reset: vi.fn(),
};
const startImport = {
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  reset: vi.fn(),
};

vi.mock('@/api', () => ({
  useDiscoverJiraProjects: () => discover,
  useStartJiraImport: () => startImport,
  useImportStatus: () => ({
    isLoading: false,
    data: {
      id: 'job-1',
      status: 'queued',
      progress: 0,
      currentStep: 'Queued',
      importedItems: 0,
      skippedItems: 0,
      totalItems: 0,
      errors: [],
    },
  }),
  useCancelImport: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('ImportWizard project selection', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    discover.mutateAsync.mockResolvedValue([
      { id: '1', key: 'ONE', name: 'One' },
      { id: '2', key: 'TWO', name: 'Two' },
    ]);
    startImport.mutateAsync.mockResolvedValue({ id: 'job-1' });
  });

  it('restores the active import after navigating away and returning', () => {
    window.sessionStorage.setItem('weaver:active-jira-import-id', 'job-1');

    render(<ImportWizard />);

    expect(screen.getByText('Import queued')).toBeTruthy();
  });

  it('sends only checked Jira projects when import-all is disabled', async () => {
    render(<ImportWizard />);

    fireEvent.click(screen.getByRole('button', { name: /Jira Server/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Jira URL'), {
      target: { value: 'https://jira.example.com' },
    });
    fireEvent.change(screen.getByLabelText('API token'), {
      target: { value: 'test-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect to Jira' }));

    await screen.findByText('2 accessible Jira projects found.');
    expect(
      (screen.getByRole('checkbox', { name: /Import all accessible projects/ }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: /One/ }));
    fireEvent.change(screen.getByLabelText('Issues updated since (optional)'), {
      target: { value: '2026-08-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await screen.findByText(/People are imported without access or notifications/);
    expect(screen.getByText(/Every unspecified Jira project will be skipped/)).toBeTruthy();
    expect(screen.getByText(/Local changes are retained and reported for review/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start Jira import' }));

    await waitFor(() => {
      expect(startImport.mutateAsync).toHaveBeenCalledWith({
        config: {
          source: 'jira_server',
          baseUrl: 'https://jira.example.com',
          auth: { type: 'api_token', token: 'test-token' },
        },
        projectKeys: ['ONE'],
        updatedSince: '2026-08-15',
      });
      expect(window.sessionStorage.getItem('weaver:active-jira-import-id')).toBe('job-1');
    });
  });
});
