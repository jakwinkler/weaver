import type { QueryClient } from '@tanstack/react-query';
import { clearAllCommentDrafts } from '@/features/issues/useCommentDraft';
import { clearActiveImportId } from '@/features/settings/activeImportStorage';
import { clearAllWorkflowLayouts } from '@/features/workflows/hooks/useWorkflowPositions';
import { useAuthStore } from '@/stores';

export function clearLocalSession(
  client: Pick<QueryClient, 'clear'>,
): void {
  client.clear();
  clearAllCommentDrafts();
  clearAllWorkflowLayouts();
  clearActiveImportId();
  useAuthStore.getState().logout();
}
