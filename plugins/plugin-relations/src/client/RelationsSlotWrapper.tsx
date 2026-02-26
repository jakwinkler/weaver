import { useMemo } from 'react';
import { RelationsPanel } from './RelationsPanel';
import type { RelationsApi } from './useRelations';

interface PluginApi {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

interface RelationsSlotWrapperProps {
  pluginContext: { api: PluginApi };
  issueKey: string;
}

export function RelationsSlotWrapper({ pluginContext, issueKey }: RelationsSlotWrapperProps) {
  const api = useMemo<RelationsApi>(() => {
    const base = `/issues/${issueKey}/relations`;
    return {
      list: () => pluginContext.api.get(base),
      add: (targetIssueKey: string, linkType: string) =>
        pluginContext.api.post(base, { targetIssueKey, linkType }),
      remove: (linkId: string) =>
        pluginContext.api.delete(`${base}/${linkId}`).then(() => {}),
      search: (q: string) =>
        pluginContext.api.get(`${base}/search`, { q }),
    };
  }, [pluginContext, issueKey]);

  return <RelationsPanel api={api} issueKey={issueKey} />;
}
