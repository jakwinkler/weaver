import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/layouts/AppLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';
import { IssueListPage } from '@/features/issues/IssueListPage';
import { IssueDetailPage } from '@/features/issues/IssueDetailPage';
import { KanbanBoard } from '@/features/boards/KanbanBoard';
import { SprintBoard } from '@/features/boards/SprintBoard';
import { WorkflowEditor } from '@/features/workflows/WorkflowEditor';
import { CustomFieldsPage } from '@/features/settings/CustomFieldsPage';
import { SearchPage } from '@/features/search/SearchPage';
import { PluginsPage } from '@/features/settings/PluginsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectKey" element={<ProjectDetailPage />} />
              <Route path="/projects/:projectKey/issues" element={<IssueListPage />} />
              <Route path="/issues/:issueKey" element={<IssueDetailPage />} />
              <Route path="/projects/:projectKey/board" element={<KanbanBoard />} />
              <Route path="/projects/:projectKey/sprints" element={<SprintBoard />} />
              <Route path="/workflows/:workflowId" element={<WorkflowEditor />} />
              <Route path="/settings/custom-fields" element={<CustomFieldsPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/settings/plugins" element={<PluginsPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
