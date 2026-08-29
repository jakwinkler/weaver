import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateFormDto, Form, FormSubmission, UpdateFormDto } from '@weaver/shared';
import { apiClient } from './client';

export function useForms(projectKey: string) {
  return useQuery({
    queryKey: ['forms', projectKey],
    queryFn: async () => {
      const response = await apiClient.get<Form[]>(`/projects/${projectKey}/forms`);
      return response.data;
    },
    enabled: !!projectKey,
  });
}

export function useCreateForm(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateFormDto) => {
      const response = await apiClient.post<Form>(`/projects/${projectKey}/forms`, data);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forms', projectKey] }),
  });
}

export function useUpdateForm(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ formId, data }: { formId: string; data: UpdateFormDto }) => {
      const response = await apiClient.patch<Form>(`/projects/${projectKey}/forms/${formId}`, data);
      return response.data;
    },
    onSuccess: (form) => {
      queryClient.invalidateQueries({ queryKey: ['forms', projectKey] });
      queryClient.invalidateQueries({ queryKey: ['form-submissions', projectKey, form.id] });
    },
  });
}

export function useDeleteForm(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formId: string) => {
      await apiClient.delete(`/projects/${projectKey}/forms/${formId}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forms', projectKey] }),
  });
}

export function useFormSubmissions(projectKey: string, formId?: string) {
  return useQuery({
    queryKey: ['form-submissions', projectKey, formId],
    queryFn: async () => {
      const response = await apiClient.get<FormSubmission[]>(
        `/projects/${projectKey}/forms/${formId}/submissions`,
      );
      return response.data;
    },
    enabled: !!projectKey && !!formId,
  });
}
