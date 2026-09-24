import { parseDateOnly, formatDateOnly } from '@/lib/date-only';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { useDashboard } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProjectIcon } from '@/features/projects/ProjectSettingsPage';
import {
  FolderOpen,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
  Plus,
  ArrowRight,
  LayoutGrid,
  List,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const priorityConfig: Record<string, { label: string; className: string }> = {
  highest: { label: 'Highest', className: 'bg-red-100 text-red-700' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700' },
  medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-700' },
  low: { label: 'Low', className: 'bg-blue-100 text-blue-700' },
  lowest: { label: 'Lowest', className: 'bg-slate-100 text-slate-600' },
};

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading dashboard...
      </div>
    );
  }

  if (!data) return null;

  const { stats, myIssues, recentActivity, projectOverviews } = data;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'there';

  // Empty state — no projects yet
  if (stats.totalProjects === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FolderOpen className="mb-4 h-16 w-16 text-muted-foreground/40" />
        <h1 className="mb-2 text-2xl font-bold">Welcome to Weaver</h1>
        <p className="mb-6 max-w-md text-muted-foreground">
          Get started by creating your first project. Projects help you organize
          issues, track progress, and collaborate with your team.
        </p>
        <Button asChild>
          <Link to="/projects">
            <Plus className="mr-2 h-4 w-4" />
            Create your first project
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Welcome back, {displayName}</h1>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={<FolderOpen className="h-5 w-5 text-blue-600" />}
          label="Projects"
          value={stats.totalProjects}
        />
        <StatCard
          icon={<ListChecks className="h-5 w-5 text-violet-600" />}
          label="My Open Issues"
          value={stats.myOpenIssues}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          label="Overdue"
          value={stats.overdueIssues}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          label="Done This Week"
          value={stats.completedThisWeek}
        />
      </div>

      {/* Your Projects */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Projects</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/projects">
              View all <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projectOverviews.slice(0, 6).map((project) => (
            <Card key={project.key} className="flex flex-col">
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <ProjectIcon
                  iconAttachmentId={project.iconAttachmentId}
                  projectKey={project.key}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/projects/${project.key}`}
                    className="hover:underline"
                  >
                    <CardTitle className="truncate text-sm">
                      {project.name}
                    </CardTitle>
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {project.key}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground">
                      {project.myOpenIssues}
                    </span>{' '}
                    open to me
                  </span>
                  <span>
                    <span className="font-medium text-foreground">
                      {project.myDoneIssues}
                    </span>{' '}
                    done this week
                  </span>
                  <span>
                    <span className="font-medium text-foreground">
                      {project.totalIssues}
                    </span>{' '}
                    total
                  </span>
                </div>
                <div className="mt-auto flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <Link to={`/projects/${project.key}/issues`}>
                      <List className="mr-1 h-3 w-3" />
                      Issues
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <Link to={`/projects/${project.key}/board`}>
                      <LayoutGrid className="mr-1 h-3 w-3" />
                      Board
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* My Issues + Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* My Issues — 2/3 */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">My Issues</CardTitle>
            {myIssues.length > 0 && (
              <Badge variant="secondary">{myIssues.length}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {myIssues.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No issues assigned to you
              </p>
            ) : (
              <div className="space-y-1">
                {myIssues.map((issue) => {
                  const prio = priorityConfig[issue.priority] ?? priorityConfig.medium;
                  const isOverdue =
                    issue.dueDate && issue.dueDate < formatDateOnly(new Date());
                  return (
                    <Link
                      key={issue.key}
                      to={`/issues/${issue.key}`}
                      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                    >
                      <span className="min-w-[80px] text-xs font-medium text-muted-foreground">
                        {issue.key}
                      </span>
                      <span className="flex-1 truncate text-sm">
                        {issue.summary}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px]', prio.className)}
                      >
                        {prio.label}
                      </Badge>
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: issue.status.color }}
                      >
                        {issue.status.name}
                      </span>
                      {issue.dueDate && (
                        <span
                          className={cn(
                            'text-[11px]',
                            isOverdue
                              ? 'font-medium text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          {parseDateOnly(issue.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity — 1/3 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No recent activity
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((entry, idx) => (
                  <div key={idx} className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="leading-snug">
                        <span className="font-medium">
                          {entry.userDisplayName}
                        </span>{' '}
                        <span className="text-muted-foreground">
                          {entry.action}
                        </span>
                        {entry.issueKey && (
                          <>
                            {' '}
                            on{' '}
                            <Link
                              to={`/issues/${entry.issueKey}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {entry.issueKey}
                            </Link>
                          </>
                        )}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(entry.createdAt)}
                      </span>
                    </div>
                    {entry.fieldName && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.fieldName}: {entry.oldValue ?? '–'} → {entry.newValue ?? '–'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        {icon}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
