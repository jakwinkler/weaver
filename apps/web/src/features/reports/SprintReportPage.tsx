import { Link, useParams } from 'react-router-dom';
import { useSprintBurndown, useSprintSummary } from '@/api/hooks-phase2';
import { BurndownChart } from './BurndownChart';
import { SprintSummary } from './SprintSummary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function SprintReportPage() {
  const { projectKey = '', sprintId = '' } = useParams<{
    projectKey: string;
    sprintId: string;
  }>();
  const summary = useSprintSummary(sprintId);
  const burndown = useSprintBurndown(sprintId);
  const isLoading = summary.isLoading || burndown.isLoading;
  const hasError = summary.isError || burndown.isError;

  if (isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading sprint report...</p>;
  }

  if (hasError || !summary.data || !burndown.data) {
    return <p className="py-12 text-center text-destructive">Unable to load this sprint report.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Link to={`/projects/${projectKey}/sprints`} className="hover:text-primary">
              Sprints
            </Link>
            <span>/</span>
            <span>Report</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{summary.data.sprintName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sprint report</p>
        </div>
        <Button asChild variant="outline">
          <Link to={`/projects/${projectKey}/reports/velocity`}>View velocity</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sprint summary</CardTitle>
        </CardHeader>
        <CardContent>
          <SprintSummary summary={summary.data} />
          <p className="mt-4 text-sm text-muted-foreground">
            {summary.data.completedPoints} of {summary.data.totalPointsCommitted} committed points
            completed
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Burndown</CardTitle>
        </CardHeader>
        <CardContent>
          <BurndownChart data={burndown.data} />
        </CardContent>
      </Card>
    </div>
  );
}
