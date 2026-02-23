import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AdminRoute } from '@/components/AdminRoute';
import { AppLayout } from '@/layouts/AppLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';
import { ProjectSettingsPage } from '@/features/projects/ProjectSettingsPage';
import { IssueListPage } from '@/features/issues/IssueListPage';
import { IssueDetailPage } from '@/features/issues/IssueDetailPage';
import { KanbanBoard } from '@/features/boards/KanbanBoard';
import { SprintBoard } from '@/features/boards/SprintBoard';
import { WorkflowEditor } from '@/features/workflows/WorkflowEditor';
import { WorkflowListPage } from '@/features/workflows/WorkflowListPage';
import { CustomFieldsPage } from '@/features/settings/CustomFieldsPage';
import { SearchPage } from '@/features/search/SearchPage';
import { PluginsPage } from '@/features/settings/PluginsPage';
import { WebhooksPage } from '@/features/settings/WebhooksPage';
import { ImportExportPage } from '@/features/settings/ImportExportPage';
import { GanttChart } from '@/features/boards/GanttChart';
import { CalendarView } from '@/features/boards/CalendarView';
import { KeyboardShortcuts } from '@/features/shortcuts/KeyboardShortcuts';
import { IssueTypesPage } from '@/features/admin/IssueTypesPage';
import { RolesPage } from '@/features/admin/RolesPage';
import { TeamsPage } from '@/features/admin/TeamsPage';
import { UsersPage } from '@/features/admin/UsersPage';
import { PluginPage } from '@/plugins/PluginPage';

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
      <TooltipProvider>
        <BrowserRouter>
          <KeyboardShortcuts />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:projectKey" element={<ProjectDetailPage />} />
                <Route path="/projects/:projectKey/settings" element={<ProjectSettingsPage />} />
                <Route path="/projects/:projectKey/issues" element={<IssueListPage />} />
                <Route path="/issues/:issueKey" element={<IssueDetailPage />} />
                <Route path="/projects/:projectKey/board" element={<KanbanBoard />} />
                <Route path="/projects/:projectKey/sprints" element={<SprintBoard />} />
                <Route path="/projects/:projectKey/gantt" element={<GanttChart />} />
                <Route path="/projects/:projectKey/calendar" element={<CalendarView />} />
                <Route path="/search" element={<SearchPage />} />

                {/* Plugin app pages */}
                <Route path="/apps/*" element={<PluginPage />} />

                {/* Admin routes */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin/workflows" element={<WorkflowListPage />} />
                  <Route path="/workflows/:workflowId" element={<WorkflowEditor />} />
                  <Route path="/admin/issue-types" element={<IssueTypesPage />} />
                  <Route path="/admin/roles" element={<RolesPage />} />
                  <Route path="/admin/teams" element={<TeamsPage />} />
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/settings/custom-fields" element={<CustomFieldsPage />} />
                  <Route path="/settings/plugins" element={<PluginsPage />} />
                  <Route path="/settings/webhooks" element={<WebhooksPage />} />
                  <Route path="/settings/import-export" element={<ImportExportPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
