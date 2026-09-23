import type { AutomationCondition, TenantUser } from '@/api';
import type { IssueType, WorkflowStatus } from '@weaver/shared';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CONDITION_FIELDS,
  conditionField,
  conditionOperator,
  conditionValue,
  createDefaultCondition,
  makeCondition,
  type AutomationConditionField,
  type AutomationConditionOperator,
} from './automation-utils';

interface ConditionBuilderProps {
  conditions: AutomationCondition[];
  onChange: (conditions: AutomationCondition[]) => void;
  users: TenantUser[];
  statuses: WorkflowStatus[];
  issueTypes: IssueType[];
  scheduled?: boolean;
}

const OPERATOR_OPTIONS: Array<{ value: AutomationConditionOperator; label: string }> = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'empty', label: 'is empty' },
  { value: 'contains', label: 'contains' },
  { value: 'before', label: 'is before' },
  { value: 'after', label: 'is after' },
];

function defaultValueForField(
  field: AutomationConditionField,
  users: TenantUser[],
  statuses: WorkflowStatus[],
  issueTypes: IssueType[],
): unknown {
  switch (field) {
    case 'priority':
      return 'high';
    case 'assigneeId':
      return users[0]?.id ?? '';
    case 'statusId':
      return statuses[0]?.id ?? '';
    case 'statusCategory':
      return 'todo';
    case 'issueType':
      return issueTypes[0]?.slug ?? '';
    case 'labels':
      return 'urgent';
    default:
      return '';
  }
}

export function ConditionBuilder({
  conditions,
  onChange,
  users,
  statuses,
  issueTypes,
  scheduled = false,
}: ConditionBuilderProps) {
  const updateCondition = (index: number, condition: AutomationCondition) => {
    onChange(
      conditions.map((current, currentIndex) => (currentIndex === index ? condition : current)),
    );
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="space-y-4">
      {conditions.length === 0 ? (
        <div className="border border-dashed border-border bg-muted/20 px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">
            This rule runs every time the trigger fires.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {scheduled
              ? 'Add a query condition to select issues, then add any additional filters.'
              : 'Add a condition when the rule should only run for matching issues.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {conditions.map((condition, index) => {
            const field = conditionField(condition);
            const operator = conditionOperator(condition);
            const value = conditionValue(condition);
            const restrictedOperator = field === 'statusCategory' || field === 'issueType';

            return (
              <div key={index}>
                {index > 0 && (
                  <div className="flex items-center gap-3 py-1" aria-hidden="true">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      And
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                )}
                <fieldset className="border border-border bg-card p-4">
                  <legend className="sr-only">Condition {index + 1}</legend>
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.35fr_auto] md:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor={`condition-field-${index}`}>Field</Label>
                      <select
                        id={`condition-field-${index}`}
                        value={field}
                        onChange={(event) => {
                          const nextField = event.target.value as AutomationConditionField;
                          const nextOperator =
                            scheduled && nextField === 'dueDate' ? 'before' : 'equals';
                          updateCondition(
                            index,
                            makeCondition(
                              nextField,
                              nextOperator,
                              nextOperator === 'before'
                                ? 'now'
                                : defaultValueForField(nextField, users, statuses, issueTypes),
                            ),
                          );
                        }}
                        className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {CONDITION_FIELDS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`condition-operator-${index}`}>Operator</Label>
                      <select
                        id={`condition-operator-${index}`}
                        value={operator}
                        onChange={(event) =>
                          updateCondition(
                            index,
                            makeCondition(
                              field,
                              event.target.value as AutomationConditionOperator,
                              value,
                            ),
                          )
                        }
                        className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {OPERATOR_OPTIONS.filter((option) => {
                          if (restrictedOperator) return option.value === 'equals';
                          if (option.value === 'before' || option.value === 'after') {
                            return scheduled && field === 'dueDate';
                          }
                          return true;
                        }).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <ConditionValueInput
                      index={index}
                      field={field}
                      operator={operator}
                      value={value}
                      users={users}
                      statuses={statuses}
                      issueTypes={issueTypes}
                      onChange={(nextValue) =>
                        updateCondition(index, makeCondition(field, operator, nextValue))
                      }
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCondition(index)}
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Remove condition ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </fieldset>
              </div>
            );
          })}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...conditions, createDefaultCondition(scheduled)])}
      >
        <Plus className="h-4 w-4" />
        Add condition
      </Button>
    </div>
  );
}

interface ConditionValueInputProps {
  index: number;
  field: AutomationConditionField;
  operator: AutomationConditionOperator;
  value: unknown;
  users: TenantUser[];
  statuses: WorkflowStatus[];
  issueTypes: IssueType[];
  onChange: (value: string) => void;
}

function ConditionValueInput({
  index,
  field,
  operator,
  value,
  users,
  statuses,
  issueTypes,
  onChange,
}: ConditionValueInputProps) {
  if (operator === 'empty') {
    return (
      <div className="space-y-1.5">
        <Label>Value</Label>
        <div className="flex h-9 items-center border border-dashed border-border bg-muted/30 px-3 text-sm text-muted-foreground">
          No value needed
        </div>
      </div>
    );
  }

  if (operator === 'before' || operator === 'after') {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`condition-value-${index}`}>Value</Label>
        <Input
          id={`condition-value-${index}`}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          placeholder="now or YYYY-MM-DD"
          autoComplete="off"
        />
      </div>
    );
  }

  const id = `condition-value-${index}`;
  const sharedClassName =
    'block h-9 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

  if (field === 'priority') {
    return (
      <SelectConditionValue id={id} value={String(value)} onChange={onChange}>
        <option value="highest">Highest</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="lowest">Lowest</option>
      </SelectConditionValue>
    );
  }
  if (field === 'assigneeId' && operator !== 'contains') {
    return (
      <SelectConditionValue id={id} value={String(value)} onChange={onChange}>
        <option value="">Select a user</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName || user.email}
          </option>
        ))}
      </SelectConditionValue>
    );
  }
  if (field === 'statusId' && operator !== 'contains') {
    return (
      <SelectConditionValue id={id} value={String(value)} onChange={onChange}>
        <option value="">Select a status</option>
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {status.name}
          </option>
        ))}
      </SelectConditionValue>
    );
  }
  if (field === 'statusCategory') {
    return (
      <SelectConditionValue id={id} value={String(value)} onChange={onChange}>
        <option value="todo">To do</option>
        <option value="in_progress">In progress</option>
        <option value="done">Done</option>
      </SelectConditionValue>
    );
  }
  if (field === 'issueType') {
    return (
      <SelectConditionValue id={id} value={String(value)} onChange={onChange}>
        <option value="">Select an issue type</option>
        {issueTypes.map((issueType) => (
          <option key={issueType.id} value={issueType.slug}>
            {issueType.name}
          </option>
        ))}
      </SelectConditionValue>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Value</Label>
      <Input
        id={id}
        type={field === 'dueDate' ? 'date' : 'text'}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field === 'labels' ? 'urgent' : 'Enter a value'}
        autoComplete="off"
        className={sharedClassName}
      />
    </div>
  );
}

function SelectConditionValue({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Value</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {children}
      </select>
    </div>
  );
}
