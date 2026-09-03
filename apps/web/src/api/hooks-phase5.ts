import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';
import { useAuthStore } from '@/stores';

// ── Notifications ──

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export function useNotifications(page = 1, perPage = 20) {
  return useQuery({
    queryKey: ['notifications', page, perPage],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Notification[]; meta: { page: number; perPage: number; total: number; totalPages: number } }>(
        `/notifications?page=${page}&perPage=${perPage}`,
      );
      return res.data;
    },
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await apiClient.get<{ count: number }>('/notifications/unread-count');
      return res.data.count;
    },
    refetchInterval: 30000, // Poll every 30s
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/notifications/mark-all-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// ── Webhooks ──

interface Webhook {
  id: string;
  projectId?: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  success: boolean;
  delivered_at: string;
}

export function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const res = await apiClient.get<Webhook[]>('/webhooks');
      return res.data;
    },
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { url: string; events: string[]; secret?: string; projectId?: string }) => {
      const res = await apiClient.post<Webhook>('/webhooks', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/webhooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });
}

export function useWebhookDeliveries(webhookId: string) {
  return useQuery({
    queryKey: ['webhookDeliveries', webhookId],
    queryFn: async () => {
      const res = await apiClient.get<WebhookDelivery[]>(`/webhooks/${webhookId}/deliveries`);
      return res.data;
    },
    enabled: !!webhookId,
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: async (webhookId: string) => {
      await apiClient.post(`/webhooks/${webhookId}/test`);
    },
  });
}

// ── User Search (Mentions) ──

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['users', 'search', query],
    queryFn: async () => {
      const res = await apiClient.get<{ id: string; displayName: string; email: string; avatarUrl?: string }[]>(
        '/users/search',
        { params: { q: query } },
      );
      return res.data;
    },
    enabled: query.length >= 1,
  });
}

// ── Roles ──

interface Role {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
  isSystem: boolean;
  createdAt: string;
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiClient.get<Role[]>('/roles');
      return res.data;
    },
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; permissions: Record<string, boolean> }) => {
      const res = await apiClient.post<Role>('/roles', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/roles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

// ── Teams ──

interface Team {
  id: string;
  name: string;
  createdAt: string;
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await apiClient.get<Team[]>('/teams');
      return res.data;
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await apiClient.post<Team>('/teams', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

// ── Permissions Helper ──

export function useMyPermissions(): string[] {
  const { data: roles } = useRoles();
  const role = useAuthStore((state) => state.role);

  if (role === 'owner') return ['*'];

  if (!roles || !role) return [];

  const myRole = roles.find((r) => r.name === role);
  if (!myRole) return [];

  return Object.entries(myRole.permissions)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

export function useHasPermission(...perms: string[]): boolean {
  const permissions = useMyPermissions();
  if (permissions.includes('*')) return true;
  return perms.some((p) => permissions.includes(p));
}
