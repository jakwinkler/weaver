import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, API_BASE_URL } from './client';
import type {
  CustomFieldDefinition,
  SavedFilter,
  TimeEntry,
  CreateTimeEntryDto,
  CustomFieldType,
} from '@weaver/shared';

// ── Custom Fields ──

export function useCustomFields() {
  return useQuery({
    queryKey: ['customFields'],
    queryFn: async () => {
      const res = await apiClient.get<CustomFieldDefinition[]>('/custom-fields');
      return res.data;
    },
  });
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      slug: string;
      fieldType: CustomFieldType;
      required: boolean;
      options?: Record<string, unknown>;
      validation?: Record<string, unknown>;
    }) => {
      const res = await apiClient.post<CustomFieldDefinition>('/custom-fields', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customFields'] });
    },
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/custom-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customFields'] });
    },
  });
}

// ── Saved Filters ──

export function useSavedFilters() {
  return useQuery({
    queryKey: ['savedFilters'],
    queryFn: async () => {
      const res = await apiClient.get<SavedFilter[]>('/saved-filters');
      return res.data;
    },
  });
}

export function useCreateSavedFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; query: string; isShared?: boolean }) => {
      const res = await apiClient.post<SavedFilter>('/saved-filters', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedFilters'] });
    },
  });
}

export function useDeleteSavedFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/saved-filters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedFilters'] });
    },
  });
}

// ── Time Entries ──

interface TimeEntrySummary {
  totalMinutes: number;
  entryCount: number;
}

export function useTimeEntries(issueKey: string) {
  return useQuery({
    queryKey: ['timeEntries', issueKey],
    queryFn: async () => {
      const res = await apiClient.get<TimeEntry[]>(`/issues/${issueKey}/time-entries`);
      return res.data;
    },
    enabled: !!issueKey,
  });
}

export function useTimeEntrySummary(issueKey: string) {
  return useQuery({
    queryKey: ['timeEntrySummary', issueKey],
    queryFn: async () => {
      const res = await apiClient.get<TimeEntrySummary>(
        `/issues/${issueKey}/time-entries/summary`,
      );
      return res.data;
    },
    enabled: !!issueKey,
  });
}

export function useCreateTimeEntry(issueKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateTimeEntryDto) => {
      const res = await apiClient.post<TimeEntry>(
        `/issues/${issueKey}/time-entries`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeEntries', issueKey] });
      queryClient.invalidateQueries({ queryKey: ['timeEntrySummary', issueKey] });
    },
  });
}

// ── Search ──

interface SearchResult {
  data: Array<{
    key: string;
    summary: string;
    priority: string;
    status: string;
    assigneeId?: string;
  }>;
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export function useSearch() {
  return useMutation({
    mutationFn: async (data: { query: string; page?: number; perPage?: number }) => {
      const res = await apiClient.post<SearchResult>('/search', data);
      return res.data;
    },
  });
}

// ── Attachments ──

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: string;
  createdAt: string;
}

export function useAttachments(issueKey: string) {
  return useQuery({
    queryKey: ['attachments', issueKey],
    queryFn: async () => {
      const res = await apiClient.get<Attachment[]>(`/issues/${issueKey}/attachments`);
      return res.data;
    },
    enabled: !!issueKey,
  });
}

export function useDeleteAttachment(issueKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/issues/${issueKey}/attachments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', issueKey] });
    },
  });
}

export function useUploadAttachment(issueKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post<Attachment>(
        `/issues/${issueKey}/attachments`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', issueKey] });
    },
  });
}

export function useGenericUploadAttachment() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post<Attachment>(
        '/attachments/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data;
    },
  });
}

export function getAttachmentUrl(id: string): string {
  return `${API_BASE_URL}/attachments/${id}/download`;
}
