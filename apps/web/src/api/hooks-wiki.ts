import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePageDto,
  Page,
  PageTreeNode,
  PageVersion,
  UpdatePageDto,
} from '@weaver/shared';
import { apiClient } from './client';

export function usePages(projectKey: string) {
  return useQuery({
    queryKey: ['pages', projectKey],
    queryFn: async () => {
      const response = await apiClient.get<Page[]>(`/projects/${projectKey}/pages`);
      return response.data;
    },
    enabled: Boolean(projectKey),
  });
}

export function usePageTree(projectKey: string) {
  return useQuery({
    queryKey: ['pages', projectKey, 'tree'],
    queryFn: async () => {
      const response = await apiClient.get<PageTreeNode[]>(
        `/projects/${projectKey}/pages/tree`,
      );
      return response.data;
    },
    enabled: Boolean(projectKey),
  });
}

export function usePage(projectKey: string, slug?: string | null) {
  return useQuery({
    queryKey: ['page', projectKey, slug],
    queryFn: async () => {
      const response = await apiClient.get<Page>(
        `/projects/${projectKey}/pages/${slug}`,
      );
      return response.data;
    },
    enabled: Boolean(projectKey && slug),
  });
}

export function usePageSearch(projectKey: string, query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: ['pages', projectKey, 'search', normalized],
    queryFn: async () => {
      const response = await apiClient.get<Page[]>(
        `/projects/${projectKey}/pages/search`,
        { params: { q: normalized } },
      );
      return response.data;
    },
    enabled: Boolean(projectKey && normalized),
  });
}

export function usePageHistory(projectKey: string, slug?: string | null) {
  return useQuery({
    queryKey: ['page', projectKey, slug, 'history'],
    queryFn: async () => {
      const response = await apiClient.get<PageVersion[]>(
        `/projects/${projectKey}/pages/${slug}/history`,
      );
      return response.data;
    },
    enabled: Boolean(projectKey && slug),
  });
}

function invalidateWiki(queryClient: ReturnType<typeof useQueryClient>, projectKey: string) {
  queryClient.invalidateQueries({ queryKey: ['pages', projectKey] });
}

export function useCreatePage(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreatePageDto) => {
      const response = await apiClient.post<Page>(
        `/projects/${projectKey}/pages`,
        data,
      );
      return response.data;
    },
    onSuccess: (page) => {
      invalidateWiki(queryClient, projectKey);
      queryClient.setQueryData(['page', projectKey, page.slug], page);
    },
  });
}

export function useUpdatePage(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, ...data }: UpdatePageDto & { slug: string }) => {
      const response = await apiClient.patch<Page>(
        `/projects/${projectKey}/pages/${slug}`,
        data,
      );
      return response.data;
    },
    onSuccess: (page, variables) => {
      invalidateWiki(queryClient, projectKey);
      queryClient.removeQueries({ queryKey: ['page', projectKey, variables.slug] });
      queryClient.setQueryData(['page', projectKey, page.slug], page);
      queryClient.invalidateQueries({
        queryKey: ['page', projectKey, page.slug, 'history'],
      });
    },
  });
}

export function useDeletePage(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      await apiClient.delete(`/projects/${projectKey}/pages/${slug}`);
    },
    onSuccess: (_data, slug) => {
      invalidateWiki(queryClient, projectKey);
      queryClient.removeQueries({ queryKey: ['page', projectKey, slug] });
    },
  });
}

export function useRestorePage(projectKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, versionId }: { slug: string; versionId: string }) => {
      const response = await apiClient.post<Page>(
        `/projects/${projectKey}/pages/${slug}/history/${versionId}/restore`,
      );
      return response.data;
    },
    onSuccess: (page, variables) => {
      invalidateWiki(queryClient, projectKey);
      queryClient.removeQueries({ queryKey: ['page', projectKey, variables.slug] });
      queryClient.setQueryData(['page', projectKey, page.slug], page);
      queryClient.invalidateQueries({
        queryKey: ['page', projectKey, page.slug, 'history'],
      });
    },
  });
}
