import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import type { Issue } from '@weaver/shared';
import { useProjectIssues } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MAX_MATCHES = 8;

interface ParentIssueFieldProps {
  issue: Issue;
  projectKey: string;
  canUpdate: boolean;
  onChange: (parentId: string | null) => Promise<unknown>;
}

export function ParentIssueField({ issue, projectKey, canUpdate, onChange }: ParentIssueFieldProps) {
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = async (parentId: string | null) => {
    setSaving(true);
    setFailed(false);
    try {
      await onChange(parentId);
      setPicking(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        {issue.parent ? (
          <Link
            to={`/issues/${issue.parent.key}`}
            className="min-w-0 text-sm text-foreground hover:underline"
          >
            <span className="font-medium text-primary">{issue.parent.key}</span>{' '}
            <span className="break-words">{issue.parent.summary}</span>
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        )}
        {canUpdate && !picking && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2"
            onClick={() => {
              setFailed(false);
              setPicking(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {issue.parent ? 'Change' : 'Set parent'}
          </Button>
        )}
      </div>
      {picking && (
        <ParentPicker
          issue={issue}
          projectKey={projectKey}
          disabled={saving}
          onSelect={save}
          onCancel={() => setPicking(false)}
        />
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Could not change the parent. Try again.
        </p>
      )}
    </div>
  );
}

/** Issues that would make a cycle as this issue's parent: the issue itself and everything under it. */
function descendantIds(issue: Issue, issues: Issue[]): Set<string> {
  const ids = new Set([issue.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of issues) {
      if (ids.has(candidate.id)) continue;
      if ((candidate.parentId && ids.has(candidate.parentId)) || (candidate.epicId && ids.has(candidate.epicId))) {
        ids.add(candidate.id);
        grew = true;
      }
    }
  }
  return ids;
}

interface ParentPickerProps {
  issue: Issue;
  projectKey: string;
  disabled: boolean;
  onSelect: (parentId: string | null) => void;
  onCancel: () => void;
}

// Mounted only while picking, so the project's issues load when someone wants to choose one.
function ParentPicker({ issue, projectKey, disabled, onSelect, onCancel }: ParentPickerProps) {
  const [query, setQuery] = useState('');
  const { data, isLoading, isError } = useProjectIssues({ projectKey, all: true });

  const candidates = useMemo(() => {
    const issues = data?.data ?? [];
    const excluded = descendantIds(issue, issues);
    return issues.filter((candidate) => !excluded.has(candidate.id) && candidate.id !== issue.parentId);
  }, [data, issue]);

  const needle = query.trim().toLowerCase();
  const matches = candidates
    .filter(
      (candidate) =>
        !needle ||
        candidate.key.toLowerCase().includes(needle) ||
        candidate.summary.toLowerCase().includes(needle),
    )
    .slice(0, MAX_MATCHES);

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Input
        type="search"
        autoFocus
        aria-label="Find a parent issue"
        placeholder="Search by key or summary"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        className="h-8"
      />
      {isLoading ? (
        <p className="px-1 text-sm text-muted-foreground">Loading issues...</p>
      ) : isError ? (
        <p role="alert" className="px-1 text-sm text-destructive">
          Could not load this project's issues.
        </p>
      ) : matches.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No matching issues.</p>
      ) : (
        <ul aria-label="Parent issue options" className="max-h-60 space-y-0.5 overflow-y-auto">
          {matches.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(candidate.id)}
                className="w-full rounded px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50"
              >
                <span className="font-medium text-primary">{candidate.key}</span>{' '}
                <span className="text-foreground">{candidate.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {issue.parentId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            Remove parent
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
