// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    vi.clearAllMocks();
    discover.mutateAsync.mockResolvedValue([
      { id: '1', key: 'ONE', name: 'One' },
      { id: '2', key: 'TWO', name: 'Two' },
    ]);
    startImport.mutateAsync.mockResolvedValue({ id: 'job-1' });
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
    fireEvent.click(screen.getByRole('checkbox', { name: /Import all accessible projects/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /One/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText(/Every unspecified Jira project will be skipped/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start Jira import' }));

    await waitFor(() => {
      expect(startImport.mutateAsync).toHaveBeenCalledWith({
        config: {
          source: 'jira_server',
          baseUrl: 'https://jira.example.com',
          auth: { type: 'api_token', token: 'test-token' },
        },
        projectKeys: ['ONE'],
      });
    });
  });
});
