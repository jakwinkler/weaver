import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArchiveRestore, FilePlus2, Link2, RefreshCw, X } from 'lucide-react';
import { JamCard } from './JamCard';
import { buttonClass, errorMessage, inputClass, primaryButtonClass } from './format';
import type { JamView, PluginComponentContext } from './types';

interface InboxViewProps {
  pluginContext: PluginComponentContext;
}

type InboxState = 'new' | 'dismissed';
type Expanded = { jamId: string; mode: 'create' | 'attach' } | null;

const PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'];

export function InboxView({ pluginContext }: InboxViewProps) {
  const api = pluginContext.api;
  const [view, setView] = useState<InboxState>('new');
  const [items, setItems] = useState<JamView[] | null>(null);
  const [counts, setCounts] = useState({ new: 0, dismissed: 0 });
  const [expanded, setExpanded] = useState<Expanded>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; issueKey?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: JamView[]; counts: { new: number; dismissed: number } }>(
        '/inbox',
        {
          state: view,
        },
      );
      setItems(data.items);
      setCounts(data.counts);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Could not load the inbox'));
      setItems([]);
    }
  }, [api, view]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  const sync = () =>
    run(async () => {
      const result = await api.post<{ imported: number; hasMore: boolean }>('/sync');
      const count = `${result.imported} ${result.imported === 1 ? 'Jam' : 'Jams'}`;
      setNotice({
        text: `Imported ${count} from Jam.${result.hasMore ? ' More are waiting; sync again.' : ''}`,
      });
      await load();
    });

  const changeState = (jamId: string, action: 'dismiss' | 'restore') =>
    run(async () => {
      await api.post(`/inbox/${jamId}/${action}`);
      await load();
    });

  const onLinked = async (text: string, issueKey: string) => {
    setExpanded(null);
    setNotice({ text, issueKey });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {(['new', 'dismissed'] as const).map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => setView(state)}
              className={`rounded px-3 py-1 text-xs font-medium ${
                view === state
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {state === 'new' ? `Inbox (${counts.new})` : `Dismissed (${counts.dismissed})`}
            </button>
          ))}
        </div>
        <button type="button" className={buttonClass} onClick={() => void sync()} disabled={busy}>
          <RefreshCw className="h-3.5 w-3.5" />
          Sync from Jam
        </button>
      </div>

      {notice && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">
          {notice.text}{' '}
          {notice.issueKey && (
            <a
              href={`/issues/${notice.issueKey}`}
              className="font-medium text-primary hover:underline"
            >
              Open {notice.issueKey}
            </a>
          )}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading Jams...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          {view === 'new'
            ? 'No Jams waiting. New Jams from the connected Jam workspace appear here.'
            : 'No dismissed Jams.'}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((jam) => (
            <JamCard
              key={jam.jamId}
              jam={jam}
              actions={
                view === 'new' ? (
                  <>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => setExpanded({ jamId: jam.jamId, mode: 'create' })}
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      Create issue
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => setExpanded({ jamId: jam.jamId, mode: 'attach' })}
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Attach
                    </button>
                    <button
                      type="button"
                      className={buttonClass}
                      disabled={busy}
                      onClick={() => void changeState(jam.jamId, 'dismiss')}
                      title="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => void changeState(jam.jamId, 'restore')}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Restore
                  </button>
                )
              }
            >
              {expanded?.jamId === jam.jamId &&
                (expanded.mode === 'create' ? (
                  <CreateIssueForm
                    pluginContext={pluginContext}
                    jam={jam}
                    onCancel={() => setExpanded(null)}
                    onCreated={(key) => onLinked(`Created ${key} from the Jam.`, key)}
                  />
                ) : (
                  <AttachForm
                    pluginContext={pluginContext}
                    jam={jam}
                    onCancel={() => setExpanded(null)}
                    onAttached={(key) => onLinked(`Attached the Jam to ${key}.`, key)}
                  />
                ))}
            </JamCard>
          ))}
        </div>
      )}
    </div>
  );
}

interface FormProps {
  pluginContext: PluginComponentContext;
  jam: JamView;
  onCancel: () => void;
}

interface ProjectOption {
  key: string;
  name: string;
}

interface IssueTypeOption {
  id: string;
  name: string;
}

function CreateIssueForm({
  pluginContext,
  jam,
  onCancel,
  onCreated,
}: FormProps & { onCreated: (key: string) => void }) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [issueTypes, setIssueTypes] = useState<IssueTypeOption[]>([]);
  const [projectKey, setProjectKey] = useState('');
  const [summary, setSummary] = useState(jam.title ?? '');
  const [issueTypeId, setIssueTypeId] = useState('');
  const [priority, setPriority] = useState('');
  const [labels, setLabels] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pluginContext.coreApi
      .get<{ data: ProjectOption[] }>('/projects', { perPage: '100', sort: 'name' })
      .then((page) => setProjects(page.data ?? []))
      .catch((loadError) => setError(errorMessage(loadError, 'Could not load projects')));
  }, [pluginContext]);

  useEffect(() => {
    setIssueTypeId('');
    setIssueTypes([]);
    if (!projectKey) return;
    pluginContext.coreApi
      .get<IssueTypeOption[]>(`/projects/${projectKey}/issue-types`)
      .then((types) => setIssueTypes(Array.isArray(types) ? types : []))
      .catch(() => setIssueTypes([]));
  }, [pluginContext, projectKey]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await pluginContext.api.post<{ issue: { key: string } }>(
        `/inbox/${jam.jamId}/create-issue`,
        {
          projectKey,
          summary: summary.trim() || undefined,
          issueTypeId: issueTypeId || undefined,
          priority: priority || undefined,
          labels: labels
            .split(',')
            .map((label) => label.trim())
            .filter(Boolean),
        },
      );
      onCreated(result.issue.key);
    } catch (createError) {
      setError(errorMessage(createError, 'Could not create the issue'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-3 grid gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-2"
    >
      <label className="text-xs text-muted-foreground sm:col-span-2">
        Summary
        <input
          className={inputClass}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          maxLength={500}
        />
      </label>
      <label className="text-xs text-muted-foreground">
        Project
        <select
          className={inputClass}
          value={projectKey}
          onChange={(event) => setProjectKey(event.target.value)}
          required
        >
          <option value="">Choose a project</option>
          {projects.map((project) => (
            <option key={project.key} value={project.key}>
              {project.name} ({project.key})
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        Issue type
        <select
          className={inputClass}
          value={issueTypeId}
          onChange={(event) => setIssueTypeId(event.target.value)}
        >
          <option value="">Project default</option>
          {issueTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        Priority
        <select
          className={inputClass}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="">Default (medium)</option>
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-muted-foreground">
        Labels
        <input
          className={inputClass}
          value={labels}
          onChange={(event) => setLabels(event.target.value)}
          placeholder="Comma separated"
        />
      </label>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        The Jam author is the reporter when they are a member who can report in the project;
        otherwise you are.
      </p>
      {error && <p className="text-xs text-destructive sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className={primaryButtonClass} disabled={busy || !projectKey}>
          Create issue
        </button>
        <button type="button" className={buttonClass} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AttachForm({
  pluginContext,
  jam,
  onCancel,
  onAttached,
}: FormProps & { onAttached: (key: string) => void }) {
  const [issueKey, setIssueKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const key = issueKey.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) {
      setError('Enter an issue key such as WEB-123');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pluginContext.api.post(`/issues/${key}/jams`, { jamId: jam.jamId });
      onAttached(key);
    } catch (attachError) {
      setError(errorMessage(attachError, 'Could not attach the Jam'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background p-3"
    >
      <input
        className={`${inputClass} max-w-48`}
        value={issueKey}
        onChange={(event) => setIssueKey(event.target.value)}
        placeholder="Issue key, such as WEB-123"
        aria-label="Issue key"
      />
      <button type="submit" className={primaryButtonClass} disabled={busy || !issueKey.trim()}>
        Attach
      </button>
      <button type="button" className={buttonClass} onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </form>
  );
}
