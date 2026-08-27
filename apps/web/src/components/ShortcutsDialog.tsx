import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutEntry {
  keys: string[];
  description: string;
  separator?: 'or' | 'then';
}

interface ShortcutGroup {
  label: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Global',
    shortcuts: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['c'], description: 'Create an issue in the current project' },
      { keys: ['g', 'p'], description: 'Go to projects', separator: 'then' },
      { keys: ['g', 'd'], description: 'Go to dashboard', separator: 'then' },
    ],
  },
  {
    label: 'Issue list',
    shortcuts: [
      { keys: ['j', 'k'], description: 'Move between issues' },
      { keys: ['Enter'], description: 'Open focused issue' },
      { keys: ['x'], description: 'Toggle focused issue selection' },
    ],
  },
  {
    label: 'Issue detail',
    shortcuts: [
      { keys: ['e'], description: 'Edit issue' },
      { keys: ['a'], description: 'Open assignee picker' },
      { keys: ['s'], description: 'Open status transition menu' },
      { keys: ['Escape'], description: 'Close the active editor or dialog' },
    ],
  },
  {
    label: 'Board',
    shortcuts: [
      { keys: ['←', '↑', '↓', '→'], description: 'Move between cards' },
      { keys: ['Enter'], description: 'Open focused card' },
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Keyboard commands available in Weaver, grouped by page context.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section
              key={group.label}
              aria-labelledby={`shortcuts-${group.label.toLowerCase().replace(' ', '-')}`}
            >
              <h2
                id={`shortcuts-${group.label.toLowerCase().replace(' ', '-')}`}
                className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {group.label}
              </h2>
              <div className="divide-y divide-border rounded-md border border-border">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={`${group.label}-${shortcut.description}`}
                    className="flex items-center justify-between gap-4 px-3 py-2.5"
                  >
                    <span className="text-sm text-foreground">{shortcut.description}</span>
                    <span
                      className="flex shrink-0 items-center gap-1"
                      aria-label={shortcut.keys.join(` ${shortcut.separator ?? 'or'} `)}
                    >
                      {shortcut.keys.map((key, index) => (
                        <span key={key} className="flex items-center gap-1">
                          {index > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {shortcut.separator ?? 'or'}
                            </span>
                          )}
                          <kbd className="inline-flex min-w-7 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground shadow-sm">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
