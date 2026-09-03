import type { QueryClient } from '@tanstack/react-query';
import { clearAllCommentDrafts } from '@/features/issues/useCommentDraft';
import { useAuthStore } from '@/stores';

export function clearLocalSession(
  client: Pick<QueryClient, 'clear'>,
): void {
  client.clear();
  clearAllCommentDrafts();
  useAuthStore.getState().logout();
}
