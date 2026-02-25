import { useMemo, useState, useEffect } from 'react';
import { TimeReportsPage } from './TimeReportsPage';
import type { TimeReportsApi } from './useTimeReports';

interface PluginApi {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  delete<T = unknown>(path: string): Promise<T>;
}

interface TimeReportsPageWrapperProps {
  pluginContext: { api: PluginApi; coreApi: PluginApi };
}

interface ProjectData {
  key: string;
  name: string;
}

interface UserData {
  id: string;
  displayName?: string;
  email: string;
}

export function TimeReportsPageWrapper({ pluginContext }: TimeReportsPageWrapperProps) {
  const [projects, setProjects] = useState<{ key: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    pluginContext.coreApi
      .get<{ data: ProjectData[] }>('/projects', { perPage: '200' })
      .then((res) => setProjects((res.data ?? []).map((p) => ({ key: p.key, name: p.name }))))
      .catch(() => {});

    pluginContext.coreApi
      .get<UserData[]>('/users')
      .then((data) =>
        setUsers((Array.isArray(data) ? data : []).map((u) => ({ id: u.id, name: u.displayName || u.email }))),
      )
      .catch(() => {});
  }, [pluginContext]);

  const api = useMemo<TimeReportsApi>(
    () => ({
      getReport: (params) => pluginContext.api.get('/report', params),
      exportCsv: (params) => pluginContext.api.get('/report/export', params),
      listSavedReports: () => pluginContext.api.get('/saved'),
      saveReport: (data) => pluginContext.api.post('/saved', data),
      deleteSavedReport: (id) => pluginContext.api.delete(`/saved/${id}`).then(() => {}),
    }),
    [pluginContext],
  );

  return <TimeReportsPage api={api} projects={projects} users={users} />;
}
