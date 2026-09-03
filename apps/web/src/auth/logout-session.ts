import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { useAuthStore } from '@/stores';

export async function endSession(
  queryClient: Pick<QueryClient, 'clear'>,
): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // Local session data must still be cleared if the server is unavailable.
  } finally {
    queryClient.clear();
    useAuthStore.getState().logout();
  }
}
