import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

export type AutomationTrigger =
  | { type: 'issue.created' }
  | { type: 'issue.updated'; field?: string }
  | { type: 'issue.status_changed' }
  | { type: 'issue.assigned' }
  | { type: 'comment.created' }
  | { type: 'sprint.started' }
  | { type: 'sprint.completed' }
  | {
      type: 'schedule';
      schedule: 'daily_9am' | 'weekly_monday' | 'hourly' | 'every_15m';
      cron?: never;
    }
  | { type: 'schedule'; cron: string; schedule?: never };

export type AutomationCondition =
  | { type: 'field_equals'; field: string; value: unknown }
  | { type: 'field_not_equals'; field: string; value: unknown }
  | { type: 'field_empty'; field: string }
  | { type: 'field_contains'; field: string; value: unknown }
  | { type: 'status_category'; value: 'todo' | 'in_progress' | 'done' }
  | { type: 'issue_type'; value: string }
  | {
      type: 'query';
      field: 'dueDate' | 'startDate' | 'createdAt' | 'updatedAt';
      operator: 'before' | 'after';
      value: string;
    };

export type AutomationAction =
  | { type: 'set_field'; field: AutomationSettableField; value: unknown }
  | { type: 'transition'; statusId: string }
  | { type: 'add_label'; label: string }
  | { type: 'add_comment'; body: string | Record<string, unknown> }
  | { type: 'send_notification'; userId: string; title?: string }
  | { type: 'webhook'; url: string };

export type AutomationSettableField =
  | 'summary'
  | 'description'
  | 'priority'
  | 'assigneeId'
  | 'labels'
  | 'parentId'
  | 'epicId'
  | 'sprintId'
  | 'customFields'
  | 'startDate'
  | 'dueDate'
  | 'percentDone';

export interface AutomationRule {
  id: string;
  projectId: string | null;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  createdBy: string;
  createdAt: string;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  triggeredBy: {
    event?: string;
    payload?: Record<string, unknown>;
    [key: string]: unknown;
  };
  triggeredAt: string;
  actionsExecuted: Array<AutomationAction | Record<string, unknown>>;
  success: boolean;
  error: string | null;
}

export interface AutomationRuleInput {
  projectId?: string | null;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export function useAutomations(projectId?: string) {
  return useQuery({
    queryKey: ['automations', projectId ?? 'all'],
    queryFn: async () => {
      const response = await apiClient.get<AutomationRule[]>('/automations', {
        params: projectId ? { projectId } : undefined,
      });
      return response.data;
    },
  });
}

export function useCreateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AutomationRuleInput) => {
      const response = await apiClient.post<AutomationRule>('/automations', input);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations'] }),
  });
}

export function useUpdateAutomation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AutomationRuleInput>) => {
      const response = await apiClient.patch<AutomationRule>(`/automations/${id}`, input);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation-log', id] });
    },
  });
}

export function useDeleteAutomation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.delete(`/automations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.removeQueries({ queryKey: ['automation-log', id] });
    },
  });
}

export function useAutomationLog(ruleId: string) {
  return useQuery({
    queryKey: ['automation-log', ruleId],
    queryFn: async () => {
      const response = await apiClient.get<AutomationExecution[]>(
        `/automations/${ruleId}/executions`,
      );
      return response.data;
    },
    enabled: Boolean(ruleId),
  });
}
