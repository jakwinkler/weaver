import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { WorkflowStatus } from '@weaver/shared';
import {
  apiClient,
  useAutomationLog,
  useAutomations,
  useCreateAutomation,
  useDeleteAutomation,
  useIssueTypes,
  useProjects,
  useUpdateAutomation,
  useUsers,
  useWorkflows,
  type AutomationRule,
  type AutomationRuleInput,
} from '@/api';
import { Activity, Bot, Clock3, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { AutomationLog, formatRelativeTime } from './AutomationLog';
import { RuleBuilder } from './RuleBuilder';
import { describeTrigger } from './automation-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface AutomationsPageProps {
  projectId?: string;
  projectKey?: string;
  embedded?: boolean;
}

interface WorkflowDetail {
  statuses: WorkflowStatus[];
}

export function AutomationsPage({ projectId, projectKey, embedded = false }: AutomationsPageProps) {
  const { data: rules, isLoading, isError } = useAutomations(projectId);
  const { data: projectsData } = useProjects({ perPage: 200 });
  const { data: users } = useUsers();
  const { data: workflows } = useWorkflows();
  const { data: issueTypes } = useIssueTypes();
  const createAutomation = useCreateAutomation();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const updateAutomation = useUpdateAutomation(editingRule?.id ?? '');

  const workflowQueries = useQueries({
    queries: (workflows ?? []).map((workflow) => ({
      queryKey: ['workflow', workflow.id],
      queryFn: async () => {
        const response = await apiClient.get<WorkflowDetail>(`/workflows/${workflow.id}`);
        return response.data;
      },
      staleTime: 60_000,
    })),
  });

  const projects = projectsData?.data ?? [];
  const statuses = useMemo(() => {
    const statusMap = new Map<string, WorkflowStatus>();
    workflowQueries.forEach((query) => {
      query.data?.statuses.forEach((status) => statusMap.set(status.id, status));
    });
    return [...statusMap.values()];
  }, [workflowQueries]);

  const openCreate = () => {
    setEditingRule(null);
    setBuilderOpen(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setBuilderOpen(true);
  };

  const saveRule = async (input: AutomationRuleInput) => {
    if (editingRule) {
      await updateAutomation.mutateAsync(input);
    } else {
      await createAutomation.mutateAsync(input);
    }
  };

  const title = embedded ? 'Project automations' : 'Automation rules';
  const description = embedded
    ? `Create rules that only respond to activity in ${projectKey ?? 'this project'}.`
    : 'Turn recurring work into consistent, auditable rules across your projects.';
  const Heading = embedded ? 'h2' : 'h1';

  return (
    <section aria-labelledby="automations-heading">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Heading
            id="automations-heading"
            className={
              embedded
                ? 'text-lg font-semibold text-foreground'
                : 'text-2xl font-bold text-foreground'
            }
          >
            {title}
          </Heading>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={openCreate} className="self-start">
          <Plus className="h-4 w-4" />
          New rule
        </Button>
      </div>

      {isLoading && (
        <div className="border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          Loading automation rules...
        </div>
      )}

      {isError && (
        <div
          className="border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          Automation rules could not be loaded. Refresh the page to try again.
        </div>
      )}

      {!isLoading && !isError && (!rules || rules.length === 0) && (
        <div className="border border-dashed border-border bg-card px-6 py-12 text-center">
          <Bot className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">No automation rules yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Start with one repetitive handoff, update, or notification that should happen the same
            way every time.
          </p>
          <Button onClick={openCreate} variant="outline" className="mt-5">
            <Plus className="h-4 w-4" />
            Create the first rule
          </Button>
        </div>
      )}

      {rules && rules.length > 0 && (
        <div className="space-y-3">
          {rules.map((rule) => (
            <AutomationRuleRow
              key={rule.id}
              rule={rule}
              scopeName={
                rule.projectId
                  ? (projects.find((project) => project.id === rule.projectId)?.name ?? 'Project')
                  : 'Global'
              }
              onEdit={() => openEdit(rule)}
            />
          ))}
        </div>
      )}

      <RuleBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        onSubmit={saveRule}
        rule={editingRule}
        fixedProjectId={projectId}
        projects={projects}
        users={users ?? []}
        statuses={statuses}
        issueTypes={issueTypes ?? []}
        isSaving={createAutomation.isPending || updateAutomation.isPending}
      />
    </section>
  );
}

function AutomationRuleRow({
  rule,
  scopeName,
  onEdit,
}: {
  rule: AutomationRule;
  scopeName: string;
  onEdit: () => void;
}) {
  const updateAutomation = useUpdateAutomation(rule.id);
  const deleteAutomation = useDeleteAutomation(rule.id);
  const { data: executions } = useAutomationLog(rule.id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const lastExecution = executions?.[0];

  const toggleEnabled = async (enabled: boolean) => {
    await updateAutomation.mutateAsync({ enabled });
  };

  const deleteRule = async () => {
    await deleteAutomation.mutateAsync();
    setDeleteOpen(false);
  };

  return (
    <article className="overflow-hidden border border-border bg-card">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(15rem,1.5fr)_minmax(11rem,1fr)_minmax(9rem,0.75fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{rule.name}</h3>
            <Badge
              variant="outline"
              className="rounded-none text-xs font-normal text-muted-foreground"
            >
              {scopeName}
            </Badge>
          </div>
          <div className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
            <Workflow className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{describeTrigger(rule.trigger)}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Activity className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {rule.conditions.length} {rule.conditions.length === 1 ? 'condition' : 'conditions'},{' '}
            {rule.actions.length} {rule.actions.length === 1 ? 'action' : 'actions'}
          </span>
        </div>

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {lastExecution
              ? `Last ran ${formatRelativeTime(lastExecution.triggeredAt)}`
              : 'Not run yet'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="mr-1 flex items-center gap-2">
            <Switch
              id={`automation-enabled-${rule.id}`}
              checked={rule.enabled}
              onCheckedChange={toggleEnabled}
              disabled={updateAutomation.isPending}
              aria-describedby={`automation-enabled-status-${rule.id}`}
            />
            <Label
              htmlFor={`automation-enabled-${rule.id}`}
              className="cursor-pointer text-xs font-medium"
            >
              {rule.enabled ? 'Enabled' : 'Disabled'}
            </Label>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {updateAutomation.isError && (
        <p
          id={`automation-enabled-status-${rule.id}`}
          className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive"
          role="alert"
        >
          The rule status could not be changed. Try again.
        </p>
      )}
      {!updateAutomation.isError && (
        <span id={`automation-enabled-status-${rule.id}`} className="sr-only" aria-live="polite">
          Rule is {rule.enabled ? 'enabled' : 'disabled'}.
        </span>
      )}

      <AutomationLog ruleId={rule.id} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{rule.name}”?</DialogTitle>
            <DialogDescription>
              The rule and its execution history will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteAutomation.isError && (
            <p className="text-sm text-destructive" role="alert">
              The rule could not be deleted. Try again.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={deleteRule}
              disabled={deleteAutomation.isPending}
            >
              {deleteAutomation.isPending ? 'Deleting...' : 'Delete rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
