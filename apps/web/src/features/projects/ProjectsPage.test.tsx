// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from './ProjectsPage';

const richDescription = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Security hardening project' }],
    },
  ],
});

vi.mock('@/api', () => ({
  useProjects: () => ({
    isLoading: false,
    data: {
      data: [
        {
          id: 'project-1',
          key: 'SEC',
          name: 'Security',
          description: richDescription,
          issueCounter: 17,
        },
      ],
      meta: { page: 1, perPage: 25, total: 1, totalPages: 1 },
    },
  }),
  useCreateProject: () => ({
    isPending: false,
    isError: false,
    mutateAsync: vi.fn(),
  }),
  useHasPermission: () => false,
  useUploadAttachment: () => ({ mutateAsync: vi.fn() }),
  useGenericUploadAttachment: () => ({ mutateAsync: vi.fn() }),
  getAttachmentUrl: (id: string) => `/attachments/${id}`,
}));

vi.mock('./ProjectSettingsPage', () => ({
  ProjectIcon: ({ projectKey }: { projectKey: string }) => <span>{projectKey}</span>,
}));

describe('ProjectsPage', () => {
  afterEach(cleanup);

  it('shows readable descriptions and the project key in the Key column', () => {
    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    const row = screen.getByRole('row', { name: /SEC Security/ });
    const cells = row.querySelectorAll('td');
    expect(cells[1]?.textContent).toBe('Security hardening project');
    expect(cells[2]?.textContent).toBe('SEC');
  });
});
