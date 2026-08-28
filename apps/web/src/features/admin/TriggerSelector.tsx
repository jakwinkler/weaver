import type { AutomationTrigger } from '@/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CONDITION_FIELDS,
  cronForTrigger,
  TRIGGER_OPTIONS,
  triggerFromOption,
  triggerOptionValue,
  type TriggerOptionValue,
} from './automation-utils';
import { CronPreview } from './CronPreview';

interface TriggerSelectorProps {
  trigger: AutomationTrigger;
  onChange: (trigger: AutomationTrigger) => void;
}

export function TriggerSelector({ trigger, onChange }: TriggerSelectorProps) {
  const selectedValue = triggerOptionValue(trigger);
  const selectedOption = TRIGGER_OPTIONS.find((option) => option.value === selectedValue);
  const categories = [...new Set(TRIGGER_OPTIONS.map((option) => option.category))];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="automation-trigger">When should this rule run?</Label>
        <select
          id="automation-trigger"
          value={selectedValue}
          onChange={(event) =>
            onChange(triggerFromOption(event.target.value as TriggerOptionValue, trigger))
          }
          aria-describedby="automation-trigger-help"
          className="block h-10 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {categories.map((category) => (
            <optgroup key={category} label={category}>
              {TRIGGER_OPTIONS.filter((option) => option.category === category).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p id="automation-trigger-help" className="text-sm text-muted-foreground">
          {selectedOption?.description}
        </p>
      </div>

      {trigger.type === 'issue.updated' && (
        <div className="space-y-1.5 border border-border bg-muted/30 p-4">
          <Label htmlFor="automation-trigger-field">Only when this field changes</Label>
          <select
            id="automation-trigger-field"
            value={trigger.field ?? ''}
            onChange={(event) =>
              onChange({
                type: 'issue.updated',
                ...(event.target.value ? { field: event.target.value } : {}),
              })
            }
            className="block h-10 w-full border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Any field</option>
            {CONDITION_FIELDS.filter(
              (field) => !['statusCategory', 'issueType'].includes(field.value),
            ).map((field) => (
              <option key={field.value} value={field.value}>
                {field.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {trigger.type === 'schedule' && selectedValue === 'schedule.custom' && (
        <div className="space-y-1.5 border border-border bg-muted/30 p-4">
          <Label htmlFor="automation-trigger-cron">Cron expression (UTC)</Label>
          <Input
            id="automation-trigger-cron"
            value={trigger.cron}
            onChange={(event) => onChange({ type: 'schedule', cron: event.target.value })}
            placeholder="0 9 * * 1-5"
            autoComplete="off"
            aria-describedby="automation-trigger-cron-help"
          />
          <p id="automation-trigger-cron-help" className="text-xs text-muted-foreground">
            Uses five fields: minute, hour, day of month, month, and day of week.
          </p>
        </div>
      )}

      {trigger.type === 'schedule' && (
        <div className="border border-border bg-muted/30 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Schedule preview
          </p>
          <CronPreview expression={cronForTrigger(trigger)} />
        </div>
      )}
    </div>
  );
}
