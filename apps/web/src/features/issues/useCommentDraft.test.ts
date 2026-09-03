// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores';
import { loadDraft, saveDraft } from './useCommentDraft';

const content = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'private draft' }] }],
};

describe('comment drafts', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      tenantId: 'tenant-a',
      user: { id: 'user-a' } as never,
    });
  });

  it('does not expose one user or tenant draft to another session', () => {
    saveDraft('ISSUE-1', content);
    useAuthStore.setState({
      tenantId: 'tenant-b',
      user: { id: 'user-b' } as never,
    });

    expect(loadDraft('ISSUE-1')).toBeNull();
  });
});
