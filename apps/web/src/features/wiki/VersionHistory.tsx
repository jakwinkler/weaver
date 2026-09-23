import { useEffect, useRef, useState } from 'react';
import type { Page, PageVersion } from '@weaver/shared';
import { ArrowLeftRight, History, RotateCcw, X } from 'lucide-react';
import { usePageHistory } from '@/api';
import { RichTextRenderer } from '@/components/RichTextRenderer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VersionHistoryProps {
  projectKey: string;
  page: Page;
  canRestore: boolean;
  onClose: () => void;
  onRestore: (version: PageVersion) => Promise<void>;
}

export function VersionHistory({
  projectKey,
  page,
  canRestore,
  onClose,
  onRestore,
}: VersionHistoryProps) {
  const { data: versions, isLoading, isError, refetch } = usePageHistory(projectKey, page.slug);
  const [selected, setSelected] = useState<PageVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const restore = async () => {
    if (!selected) return;
    setRestoring(true);
    try {
      await onRestore(selected);
      setSelected(null);
    } catch {
      // The parent surface owns the recoverable error message.
    } finally {
      setRestoring(false);
    }
  };

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="fixed inset-y-14 right-0 z-40 w-[min(22rem,calc(100vw-1rem))] overflow-y-auto border-l border-border bg-background shadow-xl outline-none xl:static xl:w-auto xl:bg-muted/25 xl:shadow-none"
      aria-label="Version history"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" />
          Version history
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close version history">
          <X />
        </Button>
      </div>

      <div className="max-h-72 overflow-y-auto xl:max-h-[calc(100vh-13rem)]">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading history...</p>}
        {isError && (
          <div className="p-4 text-sm">
            <p className="text-destructive">History could not be loaded.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}
        {!isLoading && versions?.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No earlier versions yet.</p>
        )}
        {versions?.map((version) => (
          <button
            key={version.id}
            onClick={() => setSelected(version)}
            className={cn(
              'block w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected?.id === version.id && 'bg-muted',
            )}
          >
            <span className="block text-sm font-medium">{new Date(version.createdAt).toLocaleString()}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{version.authorDisplayName}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="border-t border-border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ArrowLeftRight className="h-4 w-4" />
            Compare content
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <p className="mb-1 font-semibold text-muted-foreground">Selected version</p>
              <p className="mb-2 text-sm font-medium text-foreground">{selected.title}</p>
              <div className="max-h-40 overflow-y-auto bg-background p-2 text-foreground ring-1 ring-border">
                <RichTextRenderer content={selected.body} className="text-xs" />
              </div>
            </div>
            <div>
              <p className="mb-1 font-semibold text-muted-foreground">Current version</p>
              <p className="mb-2 text-sm font-medium text-foreground">{page.title}</p>
              <div className="max-h-40 overflow-y-auto bg-background p-2 text-foreground ring-1 ring-border">
                <RichTextRenderer content={page.body} className="text-xs" />
              </div>
            </div>
          </div>
          {canRestore && (
            <Button className="mt-4 w-full" size="sm" onClick={() => void restore()} disabled={restoring}>
              <RotateCcw />
              {restoring ? 'Restoring...' : 'Restore this version'}
            </Button>
          )}
        </div>
      )}
    </aside>
  );
}
