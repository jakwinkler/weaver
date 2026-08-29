import { useEffect, useMemo, useState } from 'react';
import type { AutomationRule, AutomationRuleInput, TenantUser } from '@/api';
import type { IssueType, Project, WorkflowStatus } from '@weaver/shared';
import { Check, ChevronLeft, ChevronRight, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionBuilder } from './ActionBuilder';
import { ConditionBuilder } from './ConditionBuilder';
import { TriggerSelector } from './TriggerSelector';
import {
  createDefaultAction,
  describeAction,
  describeCondition,
  describeTrigger,
  validateAutomationStep,
} from './automation-utils';

const STEPS = ['Trigger', 'Conditions', 'Actions', 'Review'] as const;

interface RuleBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: AutomationRuleInput) => Promise<void>;
  rule?: AutomationRule | null;
  fixedProjectId?: string;
  projects: Project[];
  users: TenantUser[];
  statuses: WorkflowStatus[];
  issueTypes: IssueType[];
  isSaving?: boolean;
}

function createDraft(rule?: AutomationRule | null, fixedProjectId?: string): AutomationRuleInput {
  if (rule) {
    return {
      projectId: fixedProjectId ?? rule.projectId,
      name: rule.name,
      enabled: rule.enabled,
      trigger: { ...rule.trigger },
      conditions: rule.conditions.map((condition) => ({ ...condition })),
      actions: rule.actions.map((action) => ({ ...action })),
    };
  }
  return {
    projectId: fixedProjectId ?? null,
    name: '',
    enabled: true,
    trigger: { type: 'issue.created' },
    conditions: [],
    actions: [createDefaultAction()],
  };
}

export function RuleBuilder({
  open,
  onOpenChange,
  onSubmit,
  rule,
  fixedProjectId,
  projects,
  users,
  statuses,
  issueTypes,
  isSaving = false,
}: RuleBuilderProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AutomationRuleInput>(() => createDraft(rule, fixedProjectId));
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setErrors([]);
    setSaveError('');
    setDraft(createDraft(rule, fixedProjectId));
  }, [open, rule, fixedProjectId]);

  const scopeName = useMemo(() => {
    if (!draft.projectId) return 'Global';
    return projects.find((project) => project.id === draft.projectId)?.name ?? 'Project';
  }, [draft.projectId, projects]);

  const continueToNextStep = () => {
    const nextErrors = validateAutomationStep(draft, step);
    setErrors(nextErrors);
    if (nextErrors.length === 0) setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const handleSubmit = async () => {
    const nextErrors = [0, 1, 2].flatMap((draftStep) => validateAutomationStep(draft, draftStep));
    setErrors(nextErrors);
    if (nextErrors.length > 0) return;
    setSaveError('');
    try {
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        projectId: fixedProjectId ?? draft.projectId ?? null,
      });
      onOpenChange(false);
    } catch {
      setSaveError('The rule could not be saved. Check the fields and try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-2rem)] max-w-4xl grid-rows-none flex-col gap-0 overflow-hidden p-0 sm:rounded-none">
        <DialogHeader className="border-b border-border px-6 py-5 pr-14">
          <DialogTitle>{rule ? 'Edit automation rule' : 'Create automation rule'}</DialogTitle>
          <DialogDescription>
            Build the trigger, optional conditions, and ordered actions without writing code.
          </DialogDescription>
        </DialogHeader>

        <nav
          aria-label="Rule builder progress"
          className="border-b border-border bg-muted/30 px-6 py-3"
        >
          <ol className="grid grid-cols-4 gap-2">
            {STEPS.map((label, index) => {
              const isComplete = index < step;
              const isCurrent = index === step;
              return (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => index < step && setStep(index)}
                    disabled={index > step}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`flex w-full items-center gap-2 border-b-2 px-1 py-2 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isCurrent
                        ? 'border-foreground text-foreground'
                        : isComplete
                          ? 'border-muted-foreground text-foreground hover:border-foreground'
                          : 'border-transparent text-muted-foreground'
                    }`}
                  >
                    {isComplete ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Circle
                        className={`h-3.5 w-3.5 ${isCurrent ? 'fill-foreground' : ''}`}
                        aria-hidden="true"
                      />
                    )}
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{index + 1}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-6">
            <p className="text-sm font-semibold text-foreground">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {step === 0 && 'Name the rule, choose its scope, and decide what starts it.'}
              {step === 1 && 'Add optional filters. Every condition must match before actions run.'}
              {step === 2 && 'Choose what Weaver should do and drag actions into execution order.'}
              {step === 3 && 'Review the complete rule before saving it.'}
            </p>
          </div>

          {step === 0 && (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="automation-rule-name">Rule name</Label>
                <Input
                  id="automation-rule-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Assign high-priority issues"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              {!fixedProjectId && (
                <div className="space-y-1.5">
                  <Label htmlFor="automation-rule-scope">Scope</Label>
                  <select
                    id="automation-rule-scope"
                    value={draft.projectId ?? ''}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        projectId: event.target.value || null,
                      }))
                    }
                    className="block h-10 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Global, all projects</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} ({project.key})
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-muted-foreground">
                    Global rules can react to matching events from any project.
                  </p>
                </div>
              )}

              <TriggerSelector
                trigger={draft.trigger}
                onChange={(trigger) =>
                  setDraft((current) => ({
                    ...current,
                    trigger,
                    conditions:
                      trigger.type === 'schedule'
                        ? current.conditions
                        : current.conditions.filter((condition) => condition.type !== 'query'),
                  }))
                }
              />
            </div>
          )}

          {step === 1 && (
            <ConditionBuilder
              conditions={draft.conditions}
              onChange={(conditions) => setDraft((current) => ({ ...current, conditions }))}
              users={users}
              statuses={statuses}
              issueTypes={issueTypes}
              scheduled={draft.trigger.type === 'schedule'}
            />
          )}

          {step === 2 && (
            <ActionBuilder
              actions={draft.actions}
              onChange={(actions) => setDraft((current) => ({ ...current, actions }))}
              users={users}
              statuses={statuses}
            />
          )}

          {step === 3 && (
            <div className="divide-y divide-border border border-border bg-card">
              <ReviewRow label="Name" value={draft.name} />
              <ReviewRow label="Scope" value={scopeName} />
              <ReviewRow label="Trigger" value={describeTrigger(draft.trigger)} />
              <ReviewList
                label="Conditions"
                empty="No conditions. The rule runs whenever the trigger fires."
                values={draft.conditions.map(describeCondition)}
              />
              <ReviewList label="Actions" values={draft.actions.map(describeAction)} />
              <ReviewRow label="Starts as" value={draft.enabled ? 'Enabled' : 'Disabled'} />
            </div>
          )}

          {(errors.length > 0 || saveError) && (
            <div
              className="mt-5 border border-destructive/40 bg-destructive/5 px-4 py-3"
              role="alert"
            >
              <p className="text-sm font-medium text-destructive">
                {saveError || 'Complete the highlighted step before continuing.'}
              </p>
              {errors.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
                  {[...new Set(errors)].map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {errors.length > 0 ? errors.join(' ') : saveError}
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-background px-6 py-4 sm:justify-between sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (step === 0 ? onOpenChange(false) : setStep((current) => current - 1))}
            disabled={isSaving}
          >
            {step === 0 ? (
              'Cancel'
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                Back
              </>
            )}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={continueToNextStep}>
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? 'Saving rule...' : rule ? 'Save changes' : 'Create rule'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ReviewList({ label, values, empty }: { label: string; values: string[]; empty?: string }) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd>
        {values.length > 0 ? (
          <ol className="space-y-2 text-sm text-foreground">
            {values.map((value, index) => (
              <li key={`${value}-${index}`} className="flex gap-2">
                <span className="font-semibold tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>
                <span>{value}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </dd>
    </div>
  );
}
