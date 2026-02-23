import { useState, useEffect, useCallback } from 'react';

export interface ReportRow {
  project_key?: string;
  project_name?: string;
  label?: string;
  user_id?: string;
  issue_key?: string;
  issue_title?: string;
  total_minutes: number;
  entry_count: number;
}

export interface ReportFilters {
  projectKey: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
}

export interface SavedReport {
  id: string;
  name: string;
  filters: ReportFilters;
  group_by: string;
  created_at: string;
}

export interface TimeReportsApi {
  getReport(params: Record<string, string>): Promise<{ groupBy: string; rows: ReportRow[]; totals: { totalMinutes: number; totalEntries: number } }>;
  exportCsv(params: Record<string, string>): Promise<string>;
  listSavedReports(): Promise<SavedReport[]>;
  saveReport(data: { name: string; filters: ReportFilters; groupBy: string }): Promise<SavedReport>;
  deleteSavedReport(id: string): Promise<void>;
}

export function useTimeReports(api: TimeReportsApi) {
  const [filters, setFilters] = useState<ReportFilters>({
    projectKey: '',
    userId: '',
    dateFrom: '',
    dateTo: '',
  });
  const [groupBy, setGroupBy] = useState<'project' | 'user' | 'issue'>('project');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [totals, setTotals] = useState<{ totalMinutes: number; totalEntries: number }>({ totalMinutes: 0, totalEntries: 0 });
  const [loading, setLoading] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);

  const buildParams = useCallback((): Record<string, string> => {
    const params: Record<string, string> = { groupBy };
    if (filters.projectKey) params.projectKey = filters.projectKey;
    if (filters.userId) params.userId = filters.userId;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    return params;
  }, [filters, groupBy]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getReport(buildParams());
      setRows(result.rows);
      setTotals(result.totals);
    } catch {
      setRows([]);
      setTotals({ totalMinutes: 0, totalEntries: 0 });
    } finally {
      setLoading(false);
    }
  }, [api, buildParams]);

  const exportCsv = useCallback(async () => {
    try {
      const csv = await api.exportCsv(buildParams());
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'time-report.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    }
  }, [api, buildParams]);

  const fetchSavedReports = useCallback(async () => {
    setSavedLoading(true);
    try {
      const reports = await api.listSavedReports();
      setSavedReports(Array.isArray(reports) ? reports : []);
    } catch {
      setSavedReports([]);
    } finally {
      setSavedLoading(false);
    }
  }, [api]);

  const saveReport = useCallback(async (name: string) => {
    const saved = await api.saveReport({ name, filters, groupBy });
    setSavedReports((prev) => [saved, ...prev]);
    return saved;
  }, [api, filters, groupBy]);

  const deleteSavedReport = useCallback(async (id: string) => {
    await api.deleteSavedReport(id);
    setSavedReports((prev) => prev.filter((r) => r.id !== id));
  }, [api]);

  const loadSavedReport = useCallback((report: SavedReport) => {
    setFilters(report.filters);
    setGroupBy(report.group_by as 'project' | 'user' | 'issue');
  }, []);

  useEffect(() => {
    fetchSavedReports();
  }, [fetchSavedReports]);

  return {
    filters,
    setFilters,
    groupBy,
    setGroupBy,
    rows,
    totals,
    loading,
    fetchReport,
    exportCsv,
    savedReports,
    savedLoading,
    saveReport,
    deleteSavedReport,
    loadSavedReport,
  };
}
