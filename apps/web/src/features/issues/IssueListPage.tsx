import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProjectIssues, useCreateIssue, useProject, useIssueTypes, useWorkflow } from '@/api';
import type { IssuePriority } from '@weaver/shared';
import { IssueTypeIcon } from '@/components/IconPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export function IssueListPage() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const { data: project } = useProject(projectKey!);
  const { data, isLoading } = useProjectIssues({ projectKey: projectKey! });
  const createIssue = useCreateIssue(projectKey!);
  const { data: issueTypes } = useIssueTypes();
  const { data: workflow } = useWorkflow(project?.workflowId || '');

  const getStatusInfo = (statusId: string) => {
    const status = workflow?.statuses?.find((s: any) => s.id === statusId);
    return { name: status?.name || statusId.slice(0, 8), color: status?.color || '#6b7280' };
  };

  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState('');
  const [issueTypeId, setIssueTypeId] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    await createIssue.mutateAsync({
      summary,
      priority,
      labels: [],
      customFields: {},
      percentDone: 0,
      ...(issueTypeId ? { issueTypeId } : {}),
      ...(startDate ? { startDate } : {}),
      ...(dueDate ? { dueDate } : {}),
    });
    setSummary('');
    setIssueTypeId('');
    setPriority('medium');
    setStartDate('');
    setDueDate('');
    setShowForm(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading issues...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to={`/projects/${projectKey}`} className="hover:text-primary">
              {project?.name || projectKey}
            </Link>
            <span>/</span>
            <span>Issues</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Issues</h1>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Create Issue'}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-5">
            <form onSubmit={handleCreate}>
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="issueSummary">Summary</Label>
                  <Input
                    id="issueSummary"
                    type="text"
                    required
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="mt-1"
                    placeholder="Issue summary"
                  />
                </div>
                <div>
                  <Label htmlFor="issueType">Type</Label>
                  <select
                    id="issueType"
                    value={issueTypeId}
                    onChange={(e) => setIssueTypeId(e.target.value)}
                    className={cn(
                      'border-input mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm',
                      'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                    )}
                  >
                    <option value="">None</option>
                    {issueTypes?.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="issuePriority">Priority</Label>
                  <select
                    id="issuePriority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as IssuePriority)}
                    className={cn(
                      'border-input mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm',
                      'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
                    )}
                  >
                    <option value="lowest">Lowest</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="highest">Highest</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="issueStartDate">Start Date</Label>
                  <Input
                    id="issueStartDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="issueDueDate">Due Date</Label>
                  <Input
                    id="issueDueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              {createIssue.isError && (
                <p className="mt-2 text-sm text-red-600">Failed to create issue.</p>
              )}
              <div className="mt-4">
                <Button type="submit" disabled={createIssue.isPending}>
                  {createIssue.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Type
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Key
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Summary
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Priority
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Due Date
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                % Done
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.data.map((issue) => (
              <TableRow key={issue.id} className="hover:bg-muted/50">
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {issue.issueType ? (
                    <span className="inline-flex items-center gap-1.5" title={issue.issueType.name}>
                      <IssueTypeIcon
                        icon={issue.issueType.icon}
                        iconColor={issue.issueType.iconColor}
                        iconAttachmentId={issue.issueType.iconAttachmentId}
                      />
                      <span className="text-xs">{issue.issueType.name}</span>
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm font-medium text-primary">
                  <Link to={`/issues/${issue.key}`}>{issue.key}</Link>
                </TableCell>
                <TableCell className="text-sm text-foreground">
                  <Link to={`/issues/${issue.key}`}>{issue.summary}</Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <PriorityBadge priority={issue.priority} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {(() => {
                    const statusInfo = getStatusInfo(issue.statusId);
                    return (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: statusInfo.color }}
                      >
                        {statusInfo.name}
                      </span>
                    );
                  })()}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {issue.dueDate || '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-muted/50">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{ width: `${issue.percentDone ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs">{issue.percentDone ?? 0}%</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No issues yet. Create your first issue to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {data.data.length} of {data.meta.total} issues
          </span>
          <span>
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
        </div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    highest: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-blue-100 text-blue-700',
    lowest: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', colors[priority] ?? 'bg-gray-100 text-gray-700')}>
      {priority}
    </span>
  );
}
