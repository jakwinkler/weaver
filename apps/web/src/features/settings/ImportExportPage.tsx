import { useState, useRef, type ChangeEvent } from 'react';
import { useProjects } from '@/api';
import { apiClient } from '@/api/client';

interface ParsedIssue {
  summary: string;
  priority?: string;
  description?: string;
  labels?: string[];
  [key: string]: unknown;
}

export function ImportExportPage() {
  const { data: projectsData } = useProjects();
  const [selectedProject, setSelectedProject] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedIssue[]>([]);
  const [parseError, setParseError] = useState('');
  const [importProgress, setImportProgress] = useState<{
    total: number;
    completed: number;
    errors: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const projects = projectsData?.data || [];

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = async () => {
    if (!selectedProject) return;
    setExportLoading(true);
    try {
      const res = await apiClient.get(`/projects/${selectedProject}/issues`, {
        params: { perPage: 1000 },
      });
      const issues = res.data.data || res.data;
      const json = JSON.stringify(issues, null, 2);
      downloadBlob(json, `${selectedProject}-issues.json`, 'application/json');
    } catch {
      alert('Failed to export issues.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportCSV = async () => {
    if (!selectedProject) return;
    setExportLoading(true);
    try {
      const res = await apiClient.get(`/projects/${selectedProject}/issues`, {
        params: { perPage: 1000 },
      });
      const issues = res.data.data || res.data;
      if (!Array.isArray(issues) || issues.length === 0) {
        downloadBlob('No issues found', `${selectedProject}-issues.csv`, 'text/csv');
        return;
      }

      const headers = ['key', 'summary', 'priority', 'statusId', 'description', 'labels'];
      const csvRows = [headers.join(',')];

      for (const issue of issues) {
        const row = headers.map((h) => {
          const val = issue[h];
          if (val === null || val === undefined) return '';
          if (Array.isArray(val)) return `"${val.join(';')}"`;
          const str = String(val).replace(/"/g, '""');
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str}"`
            : str;
        });
        csvRows.push(row.join(','));
      }

      downloadBlob(csvRows.join('\n'), `${selectedProject}-issues.csv`, 'text/csv');
    } catch {
      alert('Failed to export issues.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setParseError('');
    setParsedData([]);

    if (!file) {
      return;
    }

    const text = await file.text();

    try {
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(text);
        const issues: ParsedIssue[] = Array.isArray(data) ? data : [data];
        setParsedData(issues);
      } else if (file.name.endsWith('.csv')) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) {
          setParseError('CSV must have a header row and at least one data row.');
          return;
        }
        const headers = lines[0].split(',').map((h) => h.trim());
        const summaryIndex = headers.indexOf('summary');
        if (summaryIndex === -1) {
          setParseError('CSV must include a "summary" column.');
          return;
        }

        const issues: ParsedIssue[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const issue: ParsedIssue = { summary: '' };
          headers.forEach((header, idx) => {
            if (header === 'labels' && values[idx]) {
              issue.labels = values[idx].split(';').map((l) => l.trim()).filter(Boolean);
            } else {
              issue[header] = values[idx] || '';
            }
          });
          if (issue.summary) {
            issues.push(issue);
          }
        }
        setParsedData(issues);
      } else {
        setParseError('Unsupported file format. Please use .json or .csv files.');
      }
    } catch {
      setParseError('Failed to parse file. Please check the format.');
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  };

  const handleImport = async () => {
    if (!selectedProject || parsedData.length === 0) return;

    setImportProgress({ total: parsedData.length, completed: 0, errors: 0 });

    let completed = 0;
    let errors = 0;

    for (const issue of parsedData) {
      try {
        await apiClient.post(`/projects/${selectedProject}/issues`, {
          summary: issue.summary,
          priority: issue.priority || 'medium',
          description: issue.description || '',
          labels: issue.labels || [],
          customFields: {},
        });
        completed++;
      } catch {
        errors++;
        completed++;
      }
      setImportProgress({ total: parsedData.length, completed, errors });
    }
  };

  const resetImport = () => {
    setParsedData([]);
    setParseError('');
    setImportProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Import / Export</h1>

      {/* Project selector */}
      <div className="mb-6">
        <label htmlFor="projectSelect" className="block text-sm font-medium text-gray-700">
          Select Project
        </label>
        <select
          id="projectSelect"
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">-- Select a project --</option>
          {projects.map((p) => (
            <option key={p.id} value={p.key}>
              {p.name} ({p.key})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Export Section */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Export Issues</h2>
          <p className="mb-4 text-sm text-gray-600">
            Download all issues from the selected project as CSV or JSON.
          </p>

          <div className="flex gap-3">
            <button
              onClick={handleExportCSV}
              disabled={!selectedProject || exportLoading}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportLoading ? 'Exporting...' : 'Export CSV'}
            </button>
            <button
              onClick={handleExportJSON}
              disabled={!selectedProject || exportLoading}
              className="rounded-md border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exportLoading ? 'Exporting...' : 'Export JSON'}
            </button>
          </div>

          {!selectedProject && (
            <p className="mt-3 text-xs text-gray-400">Select a project to enable export.</p>
          )}
        </div>

        {/* Import Section */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Import Issues</h2>
          <p className="mb-4 text-sm text-gray-600">
            Upload a CSV or JSON file to import issues into the selected project.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-600 hover:file:bg-indigo-100"
          />

          {parseError && (
            <p className="mt-3 text-sm text-red-600">{parseError}</p>
          )}

          {parsedData.length > 0 && !importProgress && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700">
                Preview ({parsedData.length} issues)
              </h3>
              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                        Summary
                      </th>
                      <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500">
                        Priority
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedData.slice(0, 20).map((issue, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-gray-700">{issue.summary}</td>
                        <td className="px-3 py-1.5 text-gray-500">
                          {issue.priority || 'medium'}
                        </td>
                      </tr>
                    ))}
                    {parsedData.length > 20 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-1.5 text-center text-gray-400">
                          ... and {parsedData.length - 20} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex gap-3">
                <button
                  onClick={handleImport}
                  disabled={!selectedProject}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Import {parsedData.length} Issues
                </button>
                <button
                  onClick={resetImport}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {importProgress && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  Importing... {importProgress.completed}/{importProgress.total}
                </span>
                {importProgress.errors > 0 && (
                  <span className="text-red-600">
                    {importProgress.errors} failed
                  </span>
                )}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{
                    width: `${(importProgress.completed / importProgress.total) * 100}%`,
                  }}
                />
              </div>
              {importProgress.completed === importProgress.total && (
                <div className="mt-3">
                  <p className="text-sm text-green-600">
                    Import complete! {importProgress.completed - importProgress.errors} issues
                    created successfully.
                  </p>
                  <button
                    onClick={resetImport}
                    className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Import More
                  </button>
                </div>
              )}
            </div>
          )}

          {!selectedProject && (
            <p className="mt-3 text-xs text-gray-400">Select a project to enable import.</p>
          )}
        </div>
      </div>
    </div>
  );
}
