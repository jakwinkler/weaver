import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Puzzle } from 'lucide-react';

interface PluginErrorBoundaryProps {
  children: ReactNode;
  pluginId: string;
}

interface PluginErrorBoundaryState {
  failed: boolean;
}

export class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  state: PluginErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PluginErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Plugin failed to load: ${this.props.pluginId}`, error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground"
          role="alert"
        >
          <Puzzle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Plugin failed to load</p>
            <p className="text-muted-foreground">
              {this.props.pluginId} is temporarily unavailable.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
