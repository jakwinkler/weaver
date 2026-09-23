import type { RecurrenceRule } from '@weaver/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface RecurrencePickerProps {
  value: RecurrenceRule | null;
  onChange: (value: RecurrenceRule | null) => void;
  disabled?: boolean;
  idPrefix?: string;
}

const WEEKDAYS = [
  { value: 0, short: 'S', label: 'Sunday' },
  { value: 1, short: 'M', label: 'Monday' },
  { value: 2, short: 'T', label: 'Tuesday' },
  { value: 3, short: 'W', label: 'Wednesday' },
  { value: 4, short: 'T', label: 'Thursday' },
  { value: 5, short: 'F', label: 'Friday' },
  { value: 6, short: 'S', label: 'Saturday' },
];

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function RecurrencePicker({
  value,
  onChange,
  disabled = false,
  idPrefix = 'recurrence',
}: RecurrencePickerProps) {
  const frequency = value?.frequency ?? 'none';
  const endCondition = value?.maxOccurrences ? 'count' : value?.endDate ? 'date' : 'never';

  const changeFrequency = (next: string) => {
    if (next === 'none') {
      onChange(null);
      return;
    }

    const base = {
      frequency: next as RecurrenceRule['frequency'],
      interval: value?.interval ?? 1,
      ...(value?.endDate ? { endDate: value.endDate } : {}),
      ...(value?.maxOccurrences ? { maxOccurrences: value.maxOccurrences } : {}),
    };
    if (next === 'weekly') {
      onChange({ ...base, frequency: 'weekly', daysOfWeek: [new Date().getUTCDay()] });
    } else if (next === 'monthly') {
      onChange({ ...base, frequency: 'monthly', dayOfMonth: new Date().getUTCDate() });
    } else {
      onChange({ ...base, frequency: 'daily' });
    }
  };

  const updateRule = (updates: Partial<RecurrenceRule>) => {
    if (value) onChange({ ...value, ...updates });
  };

  const changeEndCondition = (next: string) => {
    if (!value) return;
    const { endDate: _endDate, maxOccurrences: _maxOccurrences, ...base } = value;
    if (next === 'count') {
      onChange({ ...base, maxOccurrences: 1 });
    } else if (next === 'date') {
      onChange({ ...base, endDate: tomorrow() });
    } else {
      onChange(base);
    }
  };

  const toggleWeekday = (day: number) => {
    if (!value || value.frequency !== 'weekly') return;
    const selected = value.daysOfWeek ?? [new Date().getUTCDay()];
    const next = selected.includes(day)
      ? selected.filter((selectedDay) => selectedDay !== day)
      : [...selected, day].sort((a, b) => a - b);
    if (next.length > 0) updateRule({ daysOfWeek: next });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={`${idPrefix}-frequency`}>Repeat</Label>
        <select
          id={`${idPrefix}-frequency`}
          value={frequency}
          onChange={(event) => changeFrequency(event.target.value)}
          disabled={disabled}
          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        >
          <option value="none">None</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {value && (
        <>
          <div className="flex items-end gap-2">
            <div className="w-24">
              <Label htmlFor={`${idPrefix}-interval`}>Every</Label>
              <Input
                id={`${idPrefix}-interval`}
                type="number"
                min={1}
                max={365}
                value={value.interval}
                onChange={(event) =>
                  updateRule({ interval: Math.max(1, Number(event.target.value) || 1) })
                }
                disabled={disabled}
                className="mt-1"
              />
            </div>
            <span className="pb-2 text-sm text-muted-foreground">
              {value.frequency === 'daily'
                ? value.interval === 1
                  ? 'day'
                  : 'days'
                : value.frequency === 'weekly'
                  ? value.interval === 1
                    ? 'week'
                    : 'weeks'
                  : value.interval === 1
                    ? 'month'
                    : 'months'}
            </span>
          </div>

          {value.frequency === 'weekly' && (
            <div>
              <span className="text-sm font-medium text-foreground">On</span>
              <div className="mt-1 flex gap-1" aria-label="Weekdays">
                {WEEKDAYS.map((day) => {
                  const selected = (value.daysOfWeek ?? [new Date().getUTCDay()]).includes(
                    day.value,
                  );
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-label={day.label}
                      aria-pressed={selected}
                      title={day.label}
                      disabled={disabled}
                      onClick={() => toggleWeekday(day.value)}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background text-muted-foreground hover:bg-accent',
                        disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {value.frequency === 'monthly' && (
            <div>
              <Label htmlFor={`${idPrefix}-day-of-month`}>Day of month</Label>
              <Input
                id={`${idPrefix}-day-of-month`}
                type="number"
                min={1}
                max={31}
                value={value.dayOfMonth ?? 1}
                onChange={(event) =>
                  updateRule({
                    dayOfMonth: Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                  })
                }
                disabled={disabled}
                className="mt-1 w-24"
              />
            </div>
          )}

          <div>
            <Label htmlFor={`${idPrefix}-ends`}>Ends</Label>
            <select
              id={`${idPrefix}-ends`}
              value={endCondition}
              onChange={(event) => changeEndCondition(event.target.value)}
              disabled={disabled}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            >
              <option value="never">Never</option>
              <option value="count">After a number of occurrences</option>
              <option value="date">On a date</option>
            </select>
          </div>

          {endCondition === 'count' && (
            <div>
              <Label htmlFor={`${idPrefix}-occurrences`}>Occurrences</Label>
              <Input
                id={`${idPrefix}-occurrences`}
                type="number"
                min={1}
                max={1000}
                value={value.maxOccurrences ?? 1}
                onChange={(event) =>
                  updateRule({
                    maxOccurrences: Math.min(1000, Math.max(1, Number(event.target.value) || 1)),
                  })
                }
                disabled={disabled}
                className="mt-1 w-28"
              />
            </div>
          )}

          {endCondition === 'date' && (
            <div>
              <Label htmlFor={`${idPrefix}-end-date`}>End date</Label>
              <Input
                id={`${idPrefix}-end-date`}
                type="date"
                value={value.endDate ?? tomorrow()}
                onChange={(event) => updateRule({ endDate: event.target.value })}
                disabled={disabled}
                className="mt-1"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
