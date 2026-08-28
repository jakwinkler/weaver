import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  useIssue,
  useUpdateIssue,
  useProject,
  useWorkflow,
  useWorkflowTransitions,
  useTransitionIssue,
  useUsers,
  useHasPermission,
} from '@/api';
import type { IssuePriority } from '@weaver/shared';
import { IssueActivityTabs } from './IssueActivityTabs';
import { PluginSlot } from '@/plugins';
import { RichTextEditor, normalizeCommentBody } from '@/components/RichTextEditor';
import { ChevronDown, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StoryPointsField } from '@/components/StoryPointsField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function IssueDetailPage() {
  const { issueKey } = useParams<{ issueKey: string }>();
  const { data: issue, isLoading } = useIssue(issueKey!);
  const updateIssue = useUpdateIssue(issueKey!);
  const transitionIssue = useTransitionIssue(issueKey!);

  const projectKey = issueKey?.split('-')[0] || '';
  const { data: project } = useProject(projectKey);
  const workflowId = project?.workflowId || '';
  const { data: workflow } = useWorkflow(workflowId);
  const { data: availableTransitions } = useWorkflowTransitions(workflowId, issue?.statusId || '');
  const { data: users } = useUsers();
  const canUpdate = useHasPermission('issues.update');
  const canTransition = useHasPermission('issues.transition');
  const canAssign = useHasPermission('issues.assign');

  const [isEditing, setIsEditing] = useState(false);
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [labels, setLabels] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descJson, setDescJson] = useState<Record<string, unknown> | null>(null);

  // Keyboard shortcuts: a = assignee picker, s = status transition menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
      if (isInput || target.isContentEditable) return;

      if (e.key === 'a') {
        e.preventDefault();
        const trigger = document.querySelector<HTMLButtonElement>('[data-shortcut-assignee]');
        trigger?.click();
      } else if (e.key === 's') {
        e.preventDefault();
        const trigger = document.querySelector<HTMLButtonElement>('[data-shortcut-status]');
        trigger?.click();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (issue) {
      setSummary(issue.summary);
      setPriority(issue.priority);
      setLabels(issue.labels.join(', '));
    }
  }, [issue]);

  const startEditingDesc = useCallback(() => {
    setDescJson(normalizeCommentBody(issue?.description || null));
    setEditingDesc(true);
  }, [issue?.description]);

  const saveDescription = useCallback(async () => {
    if (!descJson) {
      await updateIssue.mutateAsync({ description: undefined });
    } else {
      await updateIssue.mutateAsync({ description: descJson });
    }
    setEditingDesc(false);
    setDescJson(null);
  }, [descJson, updateIssue]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    await updateIssue.mutateAsync({
      summary,
      priority,
      labels: labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean),
    });
    setIsEditing(false);
  };

  const handleTransition = async (transitionId: string) => {
    await transitionIssue.mutateAsync(transitionId);
  };

  // Helpers
  const getUserName = (userId: string | null | undefined) => {
    if (!userId) return null;
    const user = users?.find((u) => u.id === userId);
    return user?.displayName || user?.email || userId.slice(0, 8);
  };

  const getUserInitials = (userId: string | null | undefined) => {
    if (!userId) return '?';
    const user = users?.find((u) => u.id === userId);
    const name = user?.displayName || user?.email || '';
    return (
      name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '?'
    );
  };

  const getStatusName = (statusId: string) => {
    const status = workflow?.statuses?.find((s) => s.id === statusId);
    return status?.name || statusId.slice(0, 8);
  };

  const getStatusColor = (statusId: string) => {
    const status = workflow?.statuses?.find((s) => s.id === statusId);
    return status?.color || '#6b7280';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading issue...</p>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Issue not found.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to={`/projects/${projectKey}`} className="hover:text-primary">
          {projectKey}
        </Link>
        <span>/</span>
        <Link to={`/projects/${projectKey}/issues`} className="hover:text-primary">
          Issues
        </Link>
        <span>/</span>
        <span className="text-foreground">{issue.key}</span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main content */}
        <div className="col-span-2 space-y-6">
          {/* Issue header + edit form */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-bold text-foreground">
                  <span className="mr-2 text-primary">{issue.key}</span>
                  {isEditing ? null : issue.summary}
                </h1>
                {canUpdate && (
                  <Button variant="secondary" size="sm" onClick={() => setIsEditing(!isEditing)}>
                    {isEditing ? 'Cancel' : 'Edit'}
                  </Button>
                )}
              </div>

              {isEditing ? (
                <form onSubmit={handleSave} className="space-y-4">
                  <div>
                    <Label htmlFor="editSummary">Summary</Label>
                    <Input
                      id="editSummary"
                      type="text"
                      required
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="editPriority">Priority</Label>
                    <select
                      id="editPriority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as IssuePriority)}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="lowest">Lowest</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="highest">Highest</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="editLabels">Labels (comma-separated)</Label>
                    <Input
                      id="editLabels"
                      type="text"
                      value={labels}
                      onChange={(e) => setLabels(e.target.value)}
                      className="mt-1"
                      placeholder="bug, frontend, urgent"
                    />
                  </div>

                  {updateIssue.isError && (
                    <p className="text-sm text-destructive">Failed to update issue.</p>
                  )}

                  <Button type="submit" disabled={updateIssue.isPending}>
                    {updateIssue.isPending ? 'Saving...' : 'Save changes'}
                  </Button>
                </form>
              ) : (
                <div className="mt-4">
                  {editingDesc ? (
                    <div className="space-y-2">
                      <RichTextEditor
                        issueKey={issueKey}
                        content={descJson}
                        onChange={setDescJson}
                        placeholder="Add a description..."
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={saveDescription}
                          disabled={updateIssue.isPending}
                        >
                          <Check className="h-3.5 w-3.5" />
                          {updateIssue.isPending ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingDesc(false);
                            setDescJson(null);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="group relative">
                      {issue.description ? (
                        <RichTextEditor
                          issueKey={issueKey}
                          content={normalizeCommentBody(issue.description)}
                          editable={false}
                        />
                      ) : (
                        <p className="text-sm italic text-muted-foreground">
                          {canUpdate ? 'Click to add a description...' : 'No description provided.'}
                        </p>
                      )}
                      {canUpdate && (
                        <button
                          onClick={startEditingDesc}
                          className="absolute top-0 right-0 rounded-md bg-card p-1.5 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:text-primary group-hover:opacity-100"
                          title="Edit description"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plugin content slots (e.g. checklist) */}
          <PluginSlot name="issue-detail-content" issueKey={issueKey!} />

          {/* Tabbed Activity Section */}
          <IssueActivityTabs issueKey={issueKey!} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status transition bar */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {availableTransitions && availableTransitions.length > 0 && canTransition ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      data-shortcut-status
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-white cursor-pointer"
                      style={{ backgroundColor: getStatusColor(issue.statusId) }}
                    >
                      {getStatusName(issue.statusId)}
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {availableTransitions.map((t) => {
                      const targetStatus = (t as any).toStatus;
                      const targetColor = targetStatus?.color || '#6b7280';
                      const targetName = targetStatus?.name || t.name || 'Transition';
                      return (
                        <DropdownMenuItem
                          key={t.id}
                          onClick={() => handleTransition(t.id)}
                          disabled={transitionIssue.isPending}
                          className="gap-2"
                        >
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: targetColor }}
                          />
                          {targetName}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium text-white"
                  style={{ backgroundColor: getStatusColor(issue.statusId) }}
                >
                  {getStatusName(issue.statusId)}
                </span>
              )}
            </CardContent>
          </Card>

          {/* Plugin Slots */}
          <PluginSlot name="issue-detail-sidebar" issueKey={issueKey!} />

          {/* Details */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-foreground">Details</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Priority</dt>
                  <dd className="mt-0.5">
                    {canUpdate ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-accent cursor-pointer">
                            <PriorityBadge priority={issue.priority} />
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {(['highest', 'high', 'medium', 'low', 'lowest'] as const).map((p) => (
                            <DropdownMenuItem
                              key={p}
                              onClick={() => updateIssue.mutate({ priority: p })}
                              className={cn('gap-2', p === issue.priority && 'bg-accent')}
                            >
                              <PriorityBadge priority={p} />
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <PriorityBadge priority={issue.priority} />
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Story Points</dt>
                  <dd className="mt-1">
                    <StoryPointsField
                      value={issue.storyPoints}
                      onChange={async (storyPoints) => {
                        await updateIssue.mutateAsync({ storyPoints });
                      }}
                      disabled={!canUpdate}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Reporter</dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {getUserName(issue.reporterId)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Assignee</dt>
                  <dd className="mt-0.5">
                    {canAssign ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            data-shortcut-assignee
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-accent cursor-pointer"
                          >
                            {issue.assigneeId ? (
                              <>
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                                  {getUserInitials(issue.assigneeId)}
                                </span>
                                {getUserName(issue.assigneeId)}
                              </>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          <DropdownMenuItem
                            onClick={() => updateIssue.mutate({ assigneeId: null })}
                            disabled={!issue.assigneeId}
                            className="gap-2 text-muted-foreground"
                          >
                            Unassign
                          </DropdownMenuItem>
                          {users?.map((u) => (
                            <DropdownMenuItem
                              key={u.id}
                              onClick={() => updateIssue.mutate({ assigneeId: u.id })}
                              className={cn('gap-2', u.id === issue.assigneeId && 'bg-accent')}
                            >
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary shrink-0">
                                {(u.displayName || u.email)
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </span>
                              {u.displayName || u.email}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span className="text-sm text-foreground">
                        {getUserName(issue.assigneeId) || 'Unassigned'}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Labels</dt>
                  <dd className="mt-0.5">
                    {issue.labels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {issue.labels.map((label) => (
                          <Badge key={label} variant="secondary">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">None</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Start Date</dt>
                  <dd className="mt-0.5">
                    {canUpdate ? (
                      <input
                        type="date"
                        value={issue.startDate || ''}
                        onChange={(e) => updateIssue.mutate({ startDate: e.target.value || null })}
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      <span className="text-sm text-foreground">{issue.startDate || '-'}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Due Date</dt>
                  <dd className="mt-0.5">
                    {canUpdate ? (
                      <input
                        type="date"
                        value={issue.dueDate || ''}
                        onChange={(e) => updateIssue.mutate({ dueDate: e.target.value || null })}
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      <span className="text-sm text-foreground">{issue.dueDate || '-'}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">% Done</dt>
                  <dd className="mt-0.5 flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={issue.percentDone ?? 0}
                      onChange={(e) => updateIssue.mutate({ percentDone: Number(e.target.value) })}
                      disabled={!canUpdate}
                      className="h-2 w-24 cursor-pointer accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-foreground">{issue.percentDone ?? 0}%</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Created</dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {new Date(issue.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Updated</dt>
                  <dd className="mt-0.5 text-sm text-foreground">
                    {new Date(issue.updatedAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    highest: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200',
    lowest: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        colors[priority] ?? 'bg-muted text-muted-foreground border-border',
      )}
    >
      {priority}
    </span>
  );
}
