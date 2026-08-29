// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { RichTextRenderer } from './RichTextRenderer';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('RichTextRenderer', () => {
  it('renders replacement content when a restored page arrives', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <RichTextRenderer content={doc('Current page content')} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Current page content')).toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <RichTextRenderer content={doc('Restored page content')} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Restored page content')).toBeInTheDocument();
    });
    expect(screen.queryByText('Current page content')).not.toBeInTheDocument();
  });
});
