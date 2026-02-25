import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function FeatureNotEnabled({ featureName, projectKey }: { featureName: string; projectKey: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full bg-muted p-4">
        <Settings className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">Feature not enabled</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {featureName} is not enabled for this project.
      </p>
      <Button variant="outline" size="sm" className="mt-4" asChild>
        <Link to={`/projects/${projectKey}/settings`}>Go to Project Settings</Link>
      </Button>
    </div>
  );
}
