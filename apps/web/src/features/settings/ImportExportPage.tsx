import { useState, useRef, type ChangeEvent } from 'react';
import { useProjects } from '@/api';
import type { Issue } from '@weaver/shared';
import { fetchAllPages } from '@/api/pagination';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { extractPlainText, normalizeRichTextContent } from '@/lib/richText';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { ImportWizard } from './ImportWizard';

interface ParsedIssue {
  summary: string;
  priority?: string;
  description?: unknown;
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
      const { data: issues } = await fetchAllPages<Issue>(`/projects/${selectedProject}/issues`);
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
      const { data: issues } = await fetchAllPages<Issue>(`/projects/${selectedProject}/issues`);
      if (!Array.isArray(issues) || issues.length === 0) {
        downloadBlob('No issues found', `${selectedProject}-issues.csv`, 'text/csv');
        return;
      }

      const headers = ['key', 'summary', 'priority', 'statusId', 'description', 'labels'];
      const csvRows = [headers.join(',')];

      for (const issue of issues) {
        const row = headers.map((h) => {
          const val = h === 'description' ? extractPlainText(issue.description) : issue[h as keyof Issue];
          if (val === null || val === undefined) return '';
          const raw = Array.isArray(val) ? val.join(';') : String(val);
          const safe = /^\s*[=+@-]/.test(raw) ? `'${raw}` : raw;
          const str = safe.replace(/"/g, '""');
          return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
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
              issue.labels = values[idx]
                .split(';')
                .map((l) => l.trim())
                .filter(Boolean);
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
          description: normalizeRichTextContent(issue.description) ?? undefined,
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
      <h1 className="mb-6 text-2xl font-bold text-foreground">Import / Export</h1>

      <ImportWizard />

      <h2 className="mb-4 text-lg font-semibold text-foreground">File import and export</h2>

      {/* Project selector */}
      <div className="mb-6 space-y-1.5">
        <Label htmlFor="projectSelect">Select Project</Label>
        <select
          id="projectSelect"
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="mt-1 block w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
        <Card>
          <CardHeader>
            <CardTitle>Export Issues</CardTitle>
            <CardDescription>
              Download all issues from the selected project as CSV or JSON.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button onClick={handleExportCSV} disabled={!selectedProject || exportLoading}>
                {exportLoading ? 'Exporting...' : 'Export CSV'}
              </Button>
              <Button
                variant="outline"
                onClick={handleExportJSON}
                disabled={!selectedProject || exportLoading}
              >
                {exportLoading ? 'Exporting...' : 'Export JSON'}
              </Button>
            </div>

            {!selectedProject && (
              <p className="mt-3 text-xs text-muted-foreground">
                Select a project to enable export.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Import Section */}
        <Card>
          <CardHeader>
            <CardTitle>Import Issues</CardTitle>
            <CardDescription>
              Upload a CSV or JSON file to import issues into the selected project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
            />

            {parseError && <p className="mt-3 text-sm text-destructive">{parseError}</p>}

            {parsedData.length > 0 && !importProgress && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-foreground">
                  Preview ({parsedData.length} issues)
                </h3>
                <div className="mt-2 max-h-48 overflow-y-auto rounded border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="px-3 py-1.5 text-xs">Summary</TableHead>
                        <TableHead className="px-3 py-1.5 text-xs">Priority</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.slice(0, 20).map((issue, i) => (
                        <TableRow key={i}>
                          <TableCell className="px-3 py-1.5 text-foreground">
                            {issue.summary}
                          </TableCell>
                          <TableCell className="px-3 py-1.5 text-muted-foreground">
                            {issue.priority || 'medium'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {parsedData.length > 20 && (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            className="px-3 py-1.5 text-center text-muted-foreground"
                          >
                            ... and {parsedData.length - 20} more
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-3 flex gap-3">
                  <Button
                    onClick={handleImport}
                    disabled={!selectedProject}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Import {parsedData.length} Issues
                  </Button>
                  <Button variant="outline" onClick={resetImport}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {importProgress && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    Importing... {importProgress.completed}/{importProgress.total}
                  </span>
                  {importProgress.errors > 0 && (
                    <span className="text-destructive">{importProgress.errors} failed</span>
                  )}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
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
                    <Button variant="outline" size="sm" className="mt-2" onClick={resetImport}>
                      Import More
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!selectedProject && (
              <p className="mt-3 text-xs text-muted-foreground">
                Select a project to enable import.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
