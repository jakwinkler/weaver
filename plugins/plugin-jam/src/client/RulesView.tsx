import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { buttonClass, errorMessage, inputClass, isForbidden, primaryButtonClass } from './format';
import type { PluginComponentContext, RoutingRule, RuleMatch } from './types';

interface RulesViewProps {
  pluginContext: PluginComponentContext;
}

const MATCHERS: Array<{ key: keyof RuleMatch; label: string; placeholder: string }> = [
  { key: 'urlHost', label: 'Page host', placeholder: '*.example.com' },
  { key: 'authorEmailDomain', label: 'Reporter email domain', placeholder: 'client.com' },
  { key: 'recordingLinkPublicId', label: 'Recording link ID', placeholder: 'AbC123x' },
  { key: 'origin', label: 'Origin', placeholder: 'recording_link' },
  { key: 'titlePrefix', label: 'Title starts with', placeholder: '[WEB]' },
  { key: 'folder', label: 'Jam folder', placeholder: 'Client bugs' },
];

const PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'];

export function RulesView({ pluginContext }: RulesViewProps) {
  const api = pluginContext.api;
  const [rules, setRules] = useState<RoutingRule[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [editing, setEditing] = useState<RoutingRule | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRules((await api.get<{ items: RoutingRule[] }>('/rules')).items);
    } catch (loadError) {
      if (isForbidden(loadError)) setForbidden(true);
      else setError(errorMessage(loadError, 'Could not load rules'));
      setRules([]);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, delta: number) => {
    if (!rules) return;
    const ids = rules.map((rule) => rule.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    void run(() => api.post('/rules/reorder', { ids }));
  };

  if (forbidden)
    return (
      <p className="text-sm text-muted-foreground">Only Jam administrators can manage rules.</p>
    );
  if (!rules) return <p className="text-sm text-muted-foreground">Loading rules...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        When a Jam arrives, the first enabled rule whose conditions all match decides where it goes.
        A rule either creates an issue right away or suggests a project in the inbox. Jams that
        match no rule wait in the inbox.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {rules.length === 0 && editing === null && (
        <div className="rounded-lg border border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          No rules yet. Every Jam waits in the inbox.
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule, index) =>
          editing !== 'new' && editing?.id === rule.id ? (
            <RuleForm
              key={rule.id}
              pluginContext={pluginContext}
              rule={rule}
              busy={busy}
              onCancel={() => setEditing(null)}
              onSave={(body) =>
                run(() => api.patch(`/rules/${rule.id}`, body)).then(() => setEditing(null))
              }
            />
          ) : (
            <div
              key={rule.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {index + 1}. {rule.name}
                  {!rule.enabled && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(off)</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  When {describeMatch(rule.match)},{' '}
                  {rule.action === 'create' ? 'create an issue in' : 'suggest'} {rule.projectName} (
                  {rule.projectKey})
                  {rule.action === 'create' && rule.hourlyLimit
                    ? `, at most ${rule.hourlyLimit} an hour`
                    : ''}
                  .
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || index === 0}
                  onClick={() => move(index, -1)}
                  title="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || index === rules.length - 1}
                  onClick={() => move(index, 1)}
                  title="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => setEditing(rule)}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy}
                  onClick={() => void run(() => api.delete(`/rules/${rule.id}`))}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      {editing === 'new' ? (
        <RuleForm
          pluginContext={pluginContext}
          rule={null}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(body) => run(() => api.post('/rules', body)).then(() => setEditing(null))}
        />
      ) : (
        <button
          type="button"
          className={buttonClass}
          onClick={() => setEditing('new')}
          disabled={busy}
        >
          <Plus className="h-3.5 w-3.5" />
          Add rule
        </button>
      )}
    </div>
  );
}

function describeMatch(match: RuleMatch): string {
  const parts = MATCHERS.filter(({ key }) => match[key]).map(
    ({ key, label }) => `${label.toLowerCase()} is ${match[key]}`,
  );
  return parts.join(' and ') || 'anything';
}

interface RuleFormProps {
  pluginContext: PluginComponentContext;
  rule: RoutingRule | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}

function RuleForm({ pluginContext, rule, busy, onCancel, onSave }: RuleFormProps) {
  const [name, setName] = useState(rule?.name ?? '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [match, setMatch] = useState<RuleMatch>(rule?.match ?? {});
  const [action, setAction] = useState<'create' | 'inbox'>(rule?.action ?? 'inbox');
  const [projectKey, setProjectKey] = useState(rule?.projectKey ?? '');
  const [priority, setPriority] = useState(rule?.priority ?? '');
  const [labels, setLabels] = useState((rule?.labels ?? []).join(', '));
  const [hourlyLimit, setHourlyLimit] = useState(rule?.hourlyLimit ? String(rule.hourlyLimit) : '');
  const [projects, setProjects] = useState<Array<{ key: string; name: string }>>([]);

  useEffect(() => {
    pluginContext.coreApi
      .get<{ data: Array<{ key: string; name: string }> }>('/projects', {
        perPage: '100',
        sort: 'name',
      })
      .then((page) => setProjects(page.data ?? []))
      .catch(() => setProjects([]));
  }, [pluginContext]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave({
      name: name.trim(),
      enabled,
      match: Object.fromEntries(
        Object.entries(match).filter(([, value]) => value && String(value).trim()),
      ),
      action,
      projectKey,
      priority: priority || null,
      labels: labels
        .split(',')
        .map((label) => label.trim())
        .filter(Boolean),
      hourlyLimit: hourlyLimit ? Number(hourlyLimit) : null,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-2"
    >
      <label className="text-xs text-muted-foreground sm:col-span-2">
        Rule name
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
        />
      </label>
      <p className="text-xs font-medium text-foreground sm:col-span-2">
        Conditions (all that you fill in must match)
      </p>
      {MATCHERS.map(({ key, label, placeholder }) => (
        <label key={key} className="text-xs text-muted-foreground">
          {label}
          <input
            className={inputClass}
            value={match[key] ?? ''}
            placeholder={placeholder}
            onChange={(event) => setMatch({ ...match, [key]: event.target.value })}
          />
        </label>
      ))}
      <label className="text-xs text-muted-foreground">
        Then
        <select
          className={inputClass}
          value={action}
          onChange={(event) => setAction(event.target.value as 'create' | 'inbox')}
        >
          <option value="inbox">Suggest the project in the inbox</option>
          <option value="create">Create an issue right away</option>
        </select>
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
      {action === 'create' && (
        <>
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
          <label className="text-xs text-muted-foreground">
            Issues per hour, at most
            <input
              className={inputClass}
              type="number"
              min={1}
              max={500}
              value={hourlyLimit}
              onChange={(event) => setHourlyLimit(event.target.value)}
              placeholder="Plugin default"
            />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Issues are reported by the Jam author when they can report in the project, otherwise by
            you.
          </p>
        </>
      )}
      <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Enabled
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={busy || !name.trim() || !projectKey}
        >
          Save rule
        </button>
        <button type="button" className={buttonClass} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
