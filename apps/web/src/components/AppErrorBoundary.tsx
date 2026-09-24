import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div role="alert" className="max-w-md space-y-4">
          <h1 className="text-xl font-semibold">This page couldn’t be displayed.</h1>
          <p>Reload the page to try again. Any unsaved changes may be lost.</p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
          <a className="ml-4 underline" href="/">
            Go to dashboard
          </a>
        </div>
      </main>
    );
  }
}
