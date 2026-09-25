import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from './client';
import type {
  PublicProject,
  PublicIssue,
  PublicBoardData,
  PaginatedResponse,
  PublicForm,
  PublicFormSubmissionDto,
} from '@weaver/shared';

const publicClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export function usePublicProjects(tenantSlug: string) {
  return useQuery({
    queryKey: ['public-projects', tenantSlug],
    queryFn: async () => {
      const res = await publicClient.get<PaginatedResponse<PublicProject>>(
        `/public/${tenantSlug}/projects`,
      );
      return res.data;
    },
    enabled: !!tenantSlug,
  });
}

export function usePublicProject(tenantSlug: string, projectKey: string) {
  return useQuery({
    queryKey: ['public-project', tenantSlug, projectKey],
    queryFn: async () => {
      const res = await publicClient.get<PublicProject>(`/public/${tenantSlug}/projects/${projectKey}`);
      return res.data;
    },
    enabled: !!tenantSlug && !!projectKey,
  });
}

export function usePublicProjectIssues(tenantSlug: string, projectKey: string, page = 1, perPage = 25) {
  return useQuery({
    queryKey: ['public-issues', tenantSlug, projectKey, page, perPage],
    queryFn: async () => {
      const res = await publicClient.get<PaginatedResponse<PublicIssue>>(
        `/public/${tenantSlug}/projects/${projectKey}/issues`,
        { params: { page, perPage } },
      );
      return res.data;
    },
    enabled: !!tenantSlug && !!projectKey,
  });
}

export type { PublicBoardData } from '@weaver/shared';

export function usePublicProjectBoard(tenantSlug: string, projectKey: string, page = 1, perPage = 25) {
  return useQuery({
    queryKey: ['public-board', tenantSlug, projectKey, page, perPage],
    queryFn: async () => {
      const res = await publicClient.get<PublicBoardData>(
        `/public/${tenantSlug}/projects/${projectKey}/board`,
        { params: { page, perPage } },
      );
      return res.data;
    },
    enabled: !!tenantSlug && !!projectKey,
  });
}

export function usePublicForm(tenantSlug: string, formSlug: string) {
  return useQuery({
    queryKey: ['public-form', tenantSlug, formSlug],
    queryFn: async () => {
      const response = await publicClient.get<PublicForm>(
        `/public/${tenantSlug}/forms/${formSlug}`,
      );
      return response.data;
    },
    enabled: !!tenantSlug && !!formSlug,
    retry: false,
  });
}

export function useSubmitPublicForm(tenantSlug: string, formSlug: string) {
  return useMutation({
    mutationFn: async (data: PublicFormSubmissionDto) => {
      const response = await publicClient.post<{ submissionId: string; issueKey: string }>(
        `/public/${tenantSlug}/forms/${formSlug}/submit`,
        data,
      );
      return response.data;
    },
  });
}
