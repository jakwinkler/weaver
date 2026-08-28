import { useState, type FormEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProject, useProjectPlugins, useHasPermission } from '@/api';
import { FeatureNotEnabled } from './FeatureNotEnabled';
import { useSprints, useCreateSprint, useStartSprint, useCompleteSprint } from '@/api/hooks-phase2';
import type { Sprint, SprintStatus } from '@weaver/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function SprintStatusBadge({ status }: { status: SprintStatus }) {
  const variants: Record<SprintStatus, string> = {
    planned: 'bg-blue-100 text-blue-700 border-blue-200',
    active: 'bg-green-100 text-green-700 border-green-200',
    completed: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <Badge className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', variants[status])}>
      {status}
    </Badge>
  );
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return '--';
  return new Date(date).toLocaleDateString();
}

function SprintPointSummary({ sprint }: { sprint: Sprint }) {
  const committed = sprint.stats?.totalCommittedPoints ?? 0;
  const completed = sprint.stats?.totalCompletedPoints ?? 0;

  return (
    <span className="font-medium text-foreground">
      {completed} / {committed} pts completed
    </span>
  );
}

function SprintActions({ sprint, projectKey }: { sprint: Sprint; projectKey: string }) {
  const startSprint = useStartSprint(sprint.id);
  const completeSprint = useCompleteSprint(sprint.id);
  const canManage = useHasPermission('sprints.manage');

  if (sprint.status === 'completed') {
    return (
      <Button asChild size="sm" variant="outline" className="text-xs">
        <Link to={`/projects/${projectKey}/reports/sprint/${sprint.id}`}>Report</Link>
      </Button>
    );
  }

  if (!canManage) return null;

  if (sprint.status === 'planned') {
    return (
      <Button
        size="sm"
        onClick={() => startSprint.mutate()}
        disabled={startSprint.isPending}
        className="bg-green-600 text-xs hover:bg-green-700"
      >
        {startSprint.isPending ? 'Starting...' : 'Start Sprint'}
      </Button>
    );
  }

  if (sprint.status === 'active') {
    return (
      <Button
        size="sm"
        onClick={() => completeSprint.mutate()}
        disabled={completeSprint.isPending}
        className="text-xs"
      >
        {completeSprint.isPending ? 'Completing...' : 'Complete Sprint'}
      </Button>
    );
  }

  return null;
}

function CreateSprintForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const createSprint = useCreateSprint(projectId);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await createSprint.mutateAsync({
      name,
      goal: goal || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    setName('');
    setGoal('');
    setStartDate('');
    setEndDate('');
    onCreated();
  };

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm">Create Sprint</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sprintName">Name</Label>
            <Input
              id="sprintName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sprint 1"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sprintGoal">Goal (optional)</Label>
            <Input
              id="sprintGoal"
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should this sprint achieve?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprintStart">Start Date</Label>
              <Input
                id="sprintStart"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sprintEnd">End Date</Label>
              <Input
                id="sprintEnd"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {createSprint.isError && (
            <p className="text-sm text-destructive">Failed to create sprint.</p>
          )}
          <Button type="submit" disabled={createSprint.isPending}>
            {createSprint.isPending ? 'Creating...' : 'Create Sprint'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function SprintBoard() {
  const { projectKey } = useParams<{ projectKey: string }>();
  const { data: projectPlugins } = useProjectPlugins(projectKey!);
  const { data: project, isLoading: projectLoading } = useProject(projectKey!);
  const {
    data: sprints,
    isLoading: sprintsLoading,
    refetch: refetchSprints,
  } = useSprints(project?.id || '');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const canCreateSprint = useHasPermission('sprints.create');

  if (projectPlugins && !projectPlugins.some((p) => p.pluginId === '@weaver/plugin-sprints')) {
    return <FeatureNotEnabled featureName="Sprints" projectKey={projectKey!} />;
  }

  const isLoading = projectLoading || sprintsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading sprints...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  const activeSprint = sprints?.find((s) => s.status === 'active');
  const sortedSprints = [...(sprints || [])].sort((a, b) => {
    const order: Record<string, number> = { active: 0, planned: 1, completed: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to={`/projects/${projectKey}`} className="hover:text-primary">
          {projectKey}
        </Link>
        <span>/</span>
        <span className="text-foreground">Sprints</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Sprints</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to={`/projects/${projectKey}/reports/velocity`}>Velocity</Link>
          </Button>
          {canCreateSprint && (
            <Button
              onClick={() => setShowCreateForm(!showCreateForm)}
              variant={showCreateForm ? 'outline' : 'default'}
            >
              {showCreateForm ? 'Cancel' : 'New Sprint'}
            </Button>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="mb-6">
          <CreateSprintForm
            projectId={project.id}
            onCreated={() => {
              refetchSprints();
              setShowCreateForm(false);
            }}
          />
        </div>
      )}

      {/* Active sprint highlight */}
      {activeSprint && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{activeSprint.name}</h2>
                <SprintStatusBadge status={activeSprint.status} />
              </div>
              {activeSprint.goal && (
                <p className="mt-1 text-sm text-muted-foreground">{activeSprint.goal}</p>
              )}
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span>Start: {formatDate(activeSprint.startDate)}</span>
                <span>End: {formatDate(activeSprint.endDate)}</span>
                <SprintPointSummary sprint={activeSprint} />
              </div>
            </div>
            <SprintActions sprint={activeSprint} projectKey={projectKey!} />
          </div>

          {/* Progress bar */}
          {activeSprint.startDate && activeSprint.endDate && (
            <div className="mt-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-green-200">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        ((Date.now() - new Date(activeSprint.startDate).getTime()) /
                          (new Date(activeSprint.endDate).getTime() -
                            new Date(activeSprint.startDate).getTime())) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {Math.max(
                  0,
                  Math.ceil(
                    (new Date(activeSprint.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                  ),
                )}{' '}
                days remaining
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sprint list */}
      <div className="space-y-3">
        {sortedSprints.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">No sprints yet. Create one to get started.</p>
            </CardContent>
          </Card>
        )}

        {sortedSprints.map((sprint) => (
          <Card key={sprint.id}>
            <CardContent className="flex items-center justify-between px-4 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{sprint.name}</h3>
                  <SprintStatusBadge status={sprint.status} />
                </div>
                {sprint.goal && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{sprint.goal}</p>
                )}
                <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Start: {formatDate(sprint.startDate)}</span>
                  <span>End: {formatDate(sprint.endDate)}</span>
                  <SprintPointSummary sprint={sprint} />
                </div>
              </div>
              <SprintActions sprint={sprint} projectKey={projectKey!} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
