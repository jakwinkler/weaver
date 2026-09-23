// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RichTextRenderer } from './RichTextEditor';

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
    const first = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Before refresh' }] }],
    };
    const second = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'After refresh' }] }],
    };

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
});
