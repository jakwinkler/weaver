import { useMemo } from 'react';
import type { AutomationAction, AutomationSettableField, TenantUser } from '@/api';
import type { WorkflowStatus } from '@weaver/shared';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ACTION_TYPES,
  SET_FIELD_OPTIONS,
  createDefaultAction,
  defaultSetFieldValue,
  reorderActions,
  setFieldInputValue,
  setFieldValueFromInput,
} from './automation-utils';

interface ActionBuilderProps {
  actions: AutomationAction[];
  onChange: (actions: AutomationAction[]) => void;
  users: TenantUser[];
  statuses: WorkflowStatus[];
}

export function ActionBuilder({ actions, onChange, users, statuses }: ActionBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sortableIds = useMemo(
    () => actions.map((_, index) => `automation-action-${index}`),
    [actions],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const fromIndex = sortableIds.indexOf(String(event.active.id));
    const toIndex = sortableIds.indexOf(String(event.over.id));
    onChange(reorderActions(actions, fromIndex, toIndex));
  };

  const updateAction = (index: number, action: AutomationAction) => {
    onChange(actions.map((current, currentIndex) => (currentIndex === index ? action : current)));
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <div className="space-y-4">
      {actions.length === 0 ? (
        <div className="border border-dashed border-border bg-muted/20 px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No actions yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add at least one action for Weaver to perform.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {actions.map((action, index) => (
                <SortableAction
                  key={sortableIds[index]}
                  id={sortableIds[index]}
                  action={action}
                  index={index}
                  count={actions.length}
                  users={users}
                  statuses={statuses}
                  onChange={(nextAction) => updateAction(index, nextAction)}
                  onMove={(toIndex) => onChange(reorderActions(actions, index, toIndex))}
                  onRemove={() => removeAction(index)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...actions, createDefaultAction()])}
      >
        <Plus className="h-4 w-4" />
        Add action
      </Button>
    </div>
  );
}

interface SortableActionProps {
  id: string;
  action: AutomationAction;
  index: number;
  count: number;
  users: TenantUser[];
  statuses: WorkflowStatus[];
  onChange: (action: AutomationAction) => void;
  onMove: (toIndex: number) => void;
  onRemove: () => void;
}

function SortableAction({
  id,
  action,
  index,
  count,
  users,
  statuses,
  onChange,
  onMove,
  onRemove,
}: SortableActionProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <fieldset
      ref={setNodeRef}
      style={style}
      className={`border bg-card p-4 ${isDragging ? 'border-ring shadow-lg' : 'border-border'}`}
    >
      <legend className="sr-only">Action {index + 1}</legend>
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          className="cursor-grab touch-none p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label={`Drag to reorder action ${index + 1}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">Action {index + 1}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMove(index - 1)}
            disabled={index === 0}
            className="h-8 w-8 text-muted-foreground"
            aria-label={`Move action ${index + 1} up`}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMove(index + 1)}
            disabled={index === count - 1}
            className="h-8 w-8 text-muted-foreground"
            aria-label={`Move action ${index + 1} down`}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Remove action ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.6fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`automation-action-type-${index}`}>Action type</Label>
          <select
            id={`automation-action-type-${index}`}
            value={action.type}
            onChange={(event) =>
              onChange(createDefaultAction(event.target.value as AutomationAction['type']))
            }
            className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {ACTION_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <ActionConfiguration
          action={action}
          index={index}
          users={users}
          statuses={statuses}
          onChange={onChange}
        />
      </div>
    </fieldset>
  );
}

function ActionConfiguration({
  action,
  index,
  users,
  statuses,
  onChange,
}: {
  action: AutomationAction;
  index: number;
  users: TenantUser[];
  statuses: WorkflowStatus[];
  onChange: (action: AutomationAction) => void;
}) {
  switch (action.type) {
    case 'set_field':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`automation-action-field-${index}`}>Field</Label>
            <select
              id={`automation-action-field-${index}`}
              value={action.field}
              onChange={(event) => {
                const field = event.target.value as AutomationSettableField;
                onChange({ type: 'set_field', field, value: defaultSetFieldValue(field) });
              }}
              className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {SET_FIELD_OPTIONS.map((field) => (
                <option key={field.value} value={field.value}>
                  {field.label}
                </option>
              ))}
            </select>
          </div>
          <SetFieldValue action={action} index={index} users={users} onChange={onChange} />
        </div>
      );
    case 'transition':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={`automation-action-status-${index}`}>Target status</Label>
          <select
            id={`automation-action-status-${index}`}
            value={action.statusId}
            onChange={(event) => onChange({ ...action, statusId: event.target.value })}
            className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select a status</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        </div>
      );
    case 'add_label':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={`automation-action-label-${index}`}>Label</Label>
          <Input
            id={`automation-action-label-${index}`}
            value={action.label}
            onChange={(event) => onChange({ ...action, label: event.target.value })}
            placeholder="urgent"
            autoComplete="off"
          />
        </div>
      );
    case 'add_comment':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={`automation-action-comment-${index}`}>Comment</Label>
          <Textarea
            id={`automation-action-comment-${index}`}
            value={typeof action.body === 'string' ? action.body : ''}
            onChange={(event) => onChange({ ...action, body: event.target.value })}
            placeholder="Add a helpful comment to the issue"
            rows={3}
          />
        </div>
      );
    case 'send_notification':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`automation-action-recipient-${index}`}>Recipient</Label>
            <select
              id={`automation-action-recipient-${index}`}
              value={action.userId}
              onChange={(event) => onChange({ ...action, userId: event.target.value })}
              className="block h-9 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Select a user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName || user.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`automation-action-notification-${index}`}>Message (optional)</Label>
            <Input
              id={`automation-action-notification-${index}`}
              value={action.title ?? ''}
              onChange={(event) => onChange({ ...action, title: event.target.value || undefined })}
              placeholder="Automation completed"
              autoComplete="off"
            />
          </div>
        </div>
      );
    case 'webhook':
      return (
        <div className="space-y-1.5">
          <Label htmlFor={`automation-action-webhook-${index}`}>Webhook URL</Label>
          <Input
            id={`automation-action-webhook-${index}`}
            type="url"
            inputMode="url"
            value={action.url}
            onChange={(event) => onChange({ ...action, url: event.target.value })}
            placeholder="https://example.com/hooks/weaver"
            autoComplete="url"
          />
        </div>
      );
  }
}

function SetFieldValue({
  action,
  index,
  users,
  onChange,
}: {
  action: Extract<AutomationAction, { type: 'set_field' }>;
  index: number;
  users: TenantUser[];
  onChange: (action: AutomationAction) => void;
}) {
  const id = `automation-action-value-${index}`;
  if (action.field === 'priority') {
    return (
      <SelectActionValue
        id={id}
        label="Value"
        value={String(action.value)}
        onChange={(value) => onChange({ ...action, value })}
      >
        <option value="highest">Highest</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="lowest">Lowest</option>
      </SelectActionValue>
    );
  }
  if (action.field === 'assigneeId') {
    return (
      <SelectActionValue
        id={id}
        label="Value"
        value={String(action.value)}
        onChange={(value) => onChange({ ...action, value })}
      >
        <option value="">Unassigned</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName || user.email}
          </option>
        ))}
      </SelectActionValue>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Value</Label>
      <Input
        id={id}
        type={
          action.field === 'startDate' || action.field === 'dueDate'
            ? 'date'
            : action.field === 'percentDone'
              ? 'number'
              : 'text'
        }
        min={action.field === 'percentDone' ? 0 : undefined}
        max={action.field === 'percentDone' ? 100 : undefined}
        value={setFieldInputValue(action)}
        onChange={(event) =>
          onChange({
            ...action,
            value: setFieldValueFromInput(action.field, event.target.value),
          })
        }
        placeholder={action.field === 'labels' ? 'customer, urgent' : 'Enter a value'}
        autoComplete="off"
      />
    </div>
  );
}

function SelectActionValue({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
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
