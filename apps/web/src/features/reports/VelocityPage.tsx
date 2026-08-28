import { Link, useParams } from 'react-router-dom';
import { useSprintVelocity } from '@/api/hooks-phase2';
import { VelocityChart } from './VelocityChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function VelocityPage() {
  const { projectKey = '' } = useParams<{ projectKey: string }>();
  const velocity = useSprintVelocity(projectKey);

  if (velocity.isLoading) {
    return <p className="py-12 text-center text-muted-foreground">Loading velocity report...</p>;
  }

  if (velocity.isError || !velocity.data) {
    return <p className="py-12 text-center text-destructive">Unable to load velocity data.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to={`/projects/${projectKey}/sprints`} className="hover:text-primary">
            Sprints
          </Link>
          <span>/</span>
          <span>Velocity</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Sprint velocity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Committed and completed story points across the last 10 completed sprints.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Velocity trend</CardTitle>
        </CardHeader>
        <CardContent>
          <VelocityChart data={velocity.data} />
        </CardContent>
      </Card>
    </div>
  );
}
