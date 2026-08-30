// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RichTextRenderer } from './RichTextEditor';
import { RichTextRenderer as WikiRichTextRenderer } from './RichTextRenderer';

afterEach(cleanup);

function renderRichText(content: Record<string, unknown>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RichTextRenderer content={content} />
    </QueryClientProvider>,
  );
}

function doc(text: string) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

describe('RichTextRenderer', () => {
  it('renders formatted TipTap JSON without exposing its JSON representation', async () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Formatted description', marks: [{ type: 'bold' }] }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Linked item',
                      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const ready = true;' }],
        },
      ],
    };

    const { container } = renderRichText(content);

    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toBeTruthy());
    expect(container.querySelector('h2 strong')?.textContent).toBe('Formatted description');
    expect(container.querySelector('ul li a')?.getAttribute('href')).toBe('https://example.com');
    expect(container.querySelector('pre code')?.textContent).toBe('const ready = true;');
    expect(container.textContent).not.toContain('"type":"doc"');
  });

  it('updates read-only content after a query refresh', async () => {
    const first = doc('Before refresh');
    const second = doc('After refresh');
    const queryClient = new QueryClient();
    const view = render(
      <QueryClientProvider client={queryClient}>
        <RichTextRenderer content={first} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Before refresh')).toBeTruthy());
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <RichTextRenderer content={second} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('After refresh')).toBeTruthy());
    expect(screen.queryByText('Before refresh')).toBeNull();
  });

  it('renders replacement content when a restored wiki page arrives', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <WikiRichTextRenderer content={doc('Current page content')} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Current page content')).toBeTruthy();
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <WikiRichTextRenderer content={doc('Restored page content')} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Restored page content')).toBeTruthy());
    expect(screen.queryByText('Current page content')).toBeNull();
  });
});
