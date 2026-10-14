import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores';
import { CommentsSection } from './CommentsSection';
import { loadDraft } from './useCommentDraft';

const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('@/api', () => ({ useHasPermission: () => true }));
vi.mock('@/api/hooks-phase2', () => ({
  useComments: () => ({ data: [], isLoading: false }),
  useCreateComment: () => ({ mutateAsync: mocks.submit, isPending: false, isError: false }),
}));
vi.mock('./RichTextEditor', () => ({
  RichTextEditor: ({ content, onChange }: {
    content: { content?: Array<{ content?: Array<{ text?: string }> }> } | null;
    onChange: (value: Record<string, unknown>) => void;
  }) => (
    <textarea aria-label="Comment draft" value={content?.content?.[0]?.content?.[0]?.text ?? ''}
      onChange={(event) => onChange({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: event.target.value }] }] })} />
  ),
  RichTextRenderer: () => null,
  normalizeCommentBody: (value: unknown) => value,
}));

function mountComments() {
  return render(<QueryClientProvider client={new QueryClient()}><CommentsSection issueKey="TEST-1" /></QueryClientProvider>);
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useAuthStore.setState({ tenantId: 'tenant-a', user: { id: 'user-a' } as never });
  mocks.submit.mockReset().mockResolvedValue({ id: 'comment-1' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('comment draft submission', () => {
  it('does not restore a submitted draft when a pending autosave runs after success', async () => {
    const view = mountComments();
    fireEvent.change(screen.getByLabelText('Comment draft'), { target: { value: 'Posted comment' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Comment' })); });
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Comment draft')).toHaveValue('');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(loadDraft('TEST-1')).toBeNull();
    view.unmount();
    mountComments();
    expect(screen.getByLabelText('Comment draft')).toHaveValue('');
  });

  it('retains the draft while the server has not confirmed the comment', async () => {
    let confirm!: () => void;
    mocks.submit.mockReturnValue(new Promise<void>((resolve) => { confirm = resolve; }));
    mountComments();
    fireEvent.change(screen.getByLabelText('Comment draft'), { target: { value: 'Pending comment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(JSON.stringify(loadDraft('TEST-1'))).toContain('Pending comment');
    await act(async () => { confirm(); });
    expect(loadDraft('TEST-1')).toBeNull();
  });
});
