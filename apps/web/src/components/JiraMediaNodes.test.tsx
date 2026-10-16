// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { RichTextRenderer } from './RichTextEditor';

const state = vi.hoisted(() => ({
  files: [] as Array<Record<string, unknown>>,
  keys: [] as string[],
}));
vi.mock('@/api', () => ({
  useAttachments: (key: string) => {
    state.keys.push(key);
    return useQuery({ queryKey: ['attachments', key], queryFn: async () => [], enabled: false });
  },
  getAttachmentUrl: (id: string) => `/api/v1/attachments/${id}/download`,
  useUploadAttachment: () => ({ mutateAsync: vi.fn() }),
  useGenericUploadAttachment: () => ({ mutateAsync: vi.fn() }),
  useMentionSearch: () => ({ data: [] }),
}));
afterEach(() => {
  cleanup();
  state.files = [];
  state.keys = [];
});
function show(content: Record<string, unknown>) {
  const client = new QueryClient();
  client.setQueryData(['attachments', 'EPD-251'], state.files);
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RichTextRenderer content={content} issueKey="EPD-251" />
      </QueryClientProvider>,
    ),
  };
}
const content = {
  type: 'doc',
  content: [
    {
      type: 'jiraMediaGroup',
      content: [{ type: 'jiraMedia', attrs: { mediaId: 'source-media', width: 800 } }],
    },
  ],
};

describe('Imported media authorization', () => {
  it('renders only a matching file returned by the current issue attachment endpoint', async () => {
    state.files = [
      {
        id: 'authorized-file',
        sourceMediaId: 'source-media',
        filename: 'Review.png',
        mimeType: 'image/png',
      },
    ];
    show(content);
    const image = await screen.findByRole('img', { name: 'Review.png' });
    expect(image.getAttribute('src')).toBe('/api/v1/attachments/authorized-file/download');
    expect(state.keys.every((key) => key === 'EPD-251')).toBe(true);
  });
  it('reveals no filename or URL when the caller cannot read the referenced file', async () => {
    state.files = [
      {
        id: 'other-file',
        sourceMediaId: 'other-media',
        filename: 'Different.png',
        mimeType: 'image/png',
      },
    ];
    const { container } = show(content);
    await screen.findByText('Attachment unavailable');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).not.toContain('Different.png');
  });
  it('removes a previously visible image when access is revoked during refresh', async () => {
    state.files = [
      {
        id: 'authorized-file',
        sourceMediaId: 'source-media',
        filename: 'Review.png',
        mimeType: 'image/png',
      },
    ];
    const view = show(content);
    await screen.findByRole('img');
    state.files = [];
    act(() => view.client.setQueryData(['attachments', 'EPD-251'], []));
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull());
    expect(screen.getByText('Attachment unavailable')).toBeTruthy();
  });
});

describe('external image references', () => {
  it('offers the original link without automatically fetching the external image', async () => {
    const { container } = show({
      type: 'doc',
      content: [
        {
          type: 'jiraMediaGroup',
          content: [
            { type: 'jiraMedia', attrs: { externalUrl: 'https://images.example.test/source.png' } },
          ],
        },
      ],
    });
    const link = await screen.findByRole('link', { name: 'Open external image' });
    expect(link.getAttribute('href')).toBe('https://images.example.test/source.png');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.querySelector('img')).toBeNull();
  });
  it('rejects unsafe URLs even if stored content supplies one', async () => {
    const { container } = show({
      type: 'doc',
      content: [
        {
          type: 'jiraMediaGroup',
          content: [{ type: 'jiraMedia', attrs: { externalUrl: 'javascript:alert(1)' } }],
        },
      ],
    });
    await screen.findByText('Attachment unavailable');
    expect(container.querySelector('a')).toBeNull();
  });
});

it('shows an explicit placeholder for an image missing from the Jira source export', async () => {
  const { container } = show({
    type: 'doc',
    content: [
      {
        type: 'jiraMediaGroup',
        content: [{ type: 'jiraMedia', attrs: { sourceUnavailable: true } }],
      },
    ],
  });
  await screen.findByText('Image unavailable in Jira source');
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('a')).toBeNull();
});
