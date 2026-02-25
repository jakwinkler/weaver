import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

export interface DashboardStats {
  totalProjects: number;
  myOpenIssues: number;
  overdueIssues: number;
  completedThisWeek: number;
}

export interface DashboardIssue {
  key: string;
  summary: string;
  priority: string;
  dueDate: string | null;
  projectKey: string;
  projectName: string;
  issueTypeName: string | null;
  status: { name: string; color: string };
}

export interface DashboardActivity {
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  issueKey: string | null;
  issueSummary: string | null;
  userDisplayName: string;
}

export interface DashboardProject {
  key: string;
  name: string;
  description: string | null;
  iconAttachmentId: string | null;
  totalIssues: number;
  openIssues: number;
  myOpenIssues: number;
  myDoneIssues: number;
  updatedAt: string;
}

export interface DashboardData {
  stats: DashboardStats;
  myIssues: DashboardIssue[];
  recentActivity: DashboardActivity[];
  projectOverviews: DashboardProject[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await apiClient.get<DashboardData>('/dashboard');
      return res.data;
    },
  });
}
