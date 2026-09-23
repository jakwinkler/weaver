import { LoaderCircle } from 'lucide-react';

export function PluginLoading() {
  return (
    <div
      className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
      role="status"
      aria-label="Loading plugin"
    >
      <LoaderCircle className="h-4 w-4 animate-spin" />
      <span>Loading plugin...</span>
    </div>
  );
}
