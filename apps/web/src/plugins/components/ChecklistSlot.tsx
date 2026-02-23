import { useMemo } from 'react';
import { ChecklistPanel } from '@weaver/plugin-checklist';
import { apiClient } from '@/api/client';

interface ChecklistSlotProps {
  issueKey: string;
}

export function ChecklistSlot({ issueKey }: ChecklistSlotProps) {
  const pluginId = '@weaver~plugin-checklist';

  const api = useMemo(() => {
    const base = `/plugin-routes/${pluginId}/issues/${issueKey}/checklist`;
    return {
      list: async () => {
        const res = await apiClient.get(base);
        return res.data;
      },
      add: async (subject: string) => {
        const res = await apiClient.post(base, { subject });
        return res.data;
      },
      update: async (itemId: string, data: { subject?: string; is_done?: boolean }) => {
        const res = await apiClient.patch(`${base}/${itemId}`, data);
        return res.data;
      },
      remove: async (itemId: string) => {
        await apiClient.delete(`${base}/${itemId}`);
      },
      reorder: async (order: string[]) => {
        const res = await apiClient.put(`${base}/reorder`, { order });
        return res.data;
      },
    };
  }, [issueKey]);

  return <ChecklistPanel api={api} />;
}
