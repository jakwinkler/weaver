import { useState } from 'react';
import { Bug } from 'lucide-react';
import { ConnectionView } from './ConnectionView';
import { InboxView } from './InboxView';
import type { PluginComponentContext } from './types';

interface JamPageProps {
  pluginContext: PluginComponentContext;
}

export function JamPage({ pluginContext }: JamPageProps) {
  const [tab, setTab] = useState<'inbox' | 'connection'>('inbox');
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center gap-3">
        <Bug className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Jam</h1>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Bug reports captured with Jam, ready to become Weaver issues.
      </p>
      <div className="mb-5 flex gap-4 border-b border-border">
        {(['inbox', 'connection'] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
              tab === name
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {name === 'inbox' ? 'Inbox' : 'Connection'}
          </button>
        ))}
      </div>
      {tab === 'inbox' ? (
        <InboxView pluginContext={pluginContext} />
      ) : (
        <ConnectionView pluginContext={pluginContext} />
      )}
    </div>
  );
}
