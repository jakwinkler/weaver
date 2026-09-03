import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { clearLocalSession } from './clear-local-session';

export async function endSession(
  queryClient: Pick<QueryClient, 'clear'>,
): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // Local session data must still be cleared if the server is unavailable.
  } finally {
    clearLocalSession(queryClient);
  }
}
