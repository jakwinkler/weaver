// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Page } from '@weaver/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { PageEditor } from './PageEditor';

vi.mock('@/components/RichTextEditor', () => ({
  RichTextEditor: () => <div data-testid="rich-text-editor" />,
}));

const page: Page = {
  id: 'page-1',
  projectId: 'project-1',
  title: 'Original title',
  slug: 'original-title',
  body: { type: 'doc', content: [] },
  parentId: null,
  sortOrder: 0,
  createdBy: 'user-1',
  createdAt: new Date('2026-08-29T12:00:00Z'),
  updatedAt: new Date('2026-08-29T12:00:00Z'),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PageEditor autosave', () => {
  it('saves edits made while an earlier save is still in flight', async () => {
    vi.useFakeTimers();
    const firstSave = deferred<Page>();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue({ ...page, title: 'Newest title' });

    render(
      <PageEditor
        page={page}
        onSave={onSave}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'First edit' },
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'First edit' }));

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Newest title' },
    });
    await act(async () => {
      firstSave.resolve({ ...page, title: 'First edit' });
      await firstSave.promise;
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Newest title' }));
  });
});
