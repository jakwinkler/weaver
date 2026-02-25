import { useState } from 'react';
import { Clock, Download, Save, Trash2, FolderOpen } from 'lucide-react';
import { useTimeReports, type TimeReportsApi, type ReportRow } from './useTimeReports';

export interface ProjectOption {
  key: string;
  name: string;
}

export interface UserOption {
  id: string;
  name: string;
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function TimeReportsPage({ api, projects = [], users = [] }: {
  api: TimeReportsApi;
  projects?: ProjectOption[];
  users?: UserOption[];
}) {
  const {
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
    saveReport,
    deleteSavedReport,
    loadSavedReport,
  } = useTimeReports(api);

  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleSave = async () => {
    if (!saveName.trim()) return;
    await saveReport(saveName.trim());
    setSaveName('');
    setShowSaveInput(false);
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Clock className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Time Reports</h1>
      </div>

      {/* Saved Reports */}
      {savedReports.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Saved Reports
          </div>
          <div className="flex flex-wrap gap-2">
            {savedReports.map((r) => (
              <div key={r.id} className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
                <button
                  onClick={() => loadSavedReport(r)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  <FolderOpen className="mr-1 inline h-3 w-3" />
                  {r.name}
                </button>
                <button
                  onClick={() => deleteSavedReport(r.id)}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Project</label>
            <select
              value={filters.projectKey}
              onChange={(e) => setFilters({ ...filters, projectKey: e.target.value })}
              className="h-9 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.key} value={p.key}>{p.key} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">User</label>
            <select
              value={filters.userId}
              onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
              className="h-9 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Group By</label>
            <div className="flex rounded-md border border-input">
              {(['project', 'user', 'issue'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={`px-3 py-1.5 text-sm capitalize ${
                    groupBy === g
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-foreground hover:bg-accent'
                  } ${g === 'project' ? 'rounded-l-md' : ''} ${g === 'issue' ? 'rounded-r-md' : ''}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Run Report'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-4 flex items-center gap-2">
        {rows.length > 0 && (
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}
        {showSaveInput ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Report name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => { setShowSaveInput(false); setSaveName(''); }}
              className="h-8 rounded-md border border-input bg-background px-3 text-sm text-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveInput(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
          >
            <Save className="h-4 w-4" />
            Save Report
          </button>
        )}
      </div>

      {/* Results Table */}
      {rows.length > 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {groupBy === 'project' && (
                  <>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Project</th>
                  </>
                )}
                {groupBy === 'user' && (
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                )}
                {groupBy === 'issue' && (
                  <>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Issue</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Title</th>
                  </>
                )}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total Time</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Entries</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <ReportRowComponent key={i} row={row} groupBy={groupBy} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/50 font-medium">
                <td className="px-4 py-3 text-foreground" colSpan={groupBy === 'issue' ? 2 : 1}>
                  Total
                </td>
                <td className="px-4 py-3 text-right text-foreground">{formatHours(totals.totalMinutes)}</td>
                <td className="px-4 py-3 text-right text-foreground">{totals.totalEntries}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : !loading ? (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <Clock className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No data yet. Set your filters and click "Run Report" to generate a time report.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ReportRowComponent({ row, groupBy }: { row: ReportRow; groupBy: string }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      {groupBy === 'project' && (
        <td className="px-4 py-3 text-foreground">
          <span className="mr-2 font-mono text-xs text-muted-foreground">{row.project_key}</span>
          {row.project_name}
        </td>
      )}
      {groupBy === 'user' && (
        <td className="px-4 py-3 text-foreground">{row.label}</td>
      )}
      {groupBy === 'issue' && (
        <>
          <td className="px-4 py-3 font-mono text-xs text-primary">{row.issue_key}</td>
          <td className="px-4 py-3 text-foreground">
            {row.issue_title && row.issue_title.length > 60
              ? row.issue_title.slice(0, 60) + '...'
              : row.issue_title}
          </td>
        </>
      )}
      <td className="px-4 py-3 text-right text-foreground">{formatHours(row.total_minutes)}</td>
      <td className="px-4 py-3 text-right text-muted-foreground">{row.entry_count}</td>
    </tr>
  );
}
