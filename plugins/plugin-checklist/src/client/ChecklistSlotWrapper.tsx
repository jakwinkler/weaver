import { useMemo } from 'react';
import { ChecklistPanel } from './ChecklistPanel';
import type { ChecklistApi } from './useChecklist';

interface PluginApi {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

interface ChecklistSlotWrapperProps {
  pluginContext: { api: PluginApi };
  issueKey: string;
}

export function ChecklistSlotWrapper({ pluginContext, issueKey }: ChecklistSlotWrapperProps) {
  const api = useMemo<ChecklistApi>(() => {
    const base = `/issues/${issueKey}/checklist`;
    return {
      list: () => pluginContext.api.get(base),
      add: (subject: string) => pluginContext.api.post(base, { subject }),
      update: (itemId: string, data: { subject?: string; is_done?: boolean }) =>
        pluginContext.api.patch(`${base}/${itemId}`, data),
      remove: (itemId: string) => pluginContext.api.delete(`${base}/${itemId}`).then(() => {}),
      reorder: (order: string[]) => pluginContext.api.put(`${base}/reorder`, { order }),
    };
  }, [pluginContext, issueKey]);

  return <ChecklistPanel api={api} />;
}
