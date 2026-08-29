interface CronPreviewProps {
  expression: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};
const WEEKDAY_NAMES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

function parseInteger(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
}

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function cronValue(
  value: string,
  min: number,
  max: number,
  names: Record<string, number> = {},
): number | null {
  const named = names[value.toUpperCase()];
  if (named !== undefined) return named;
  return parseInteger(value, min, max);
}

function isCronFieldValid(
  field: string,
  min: number,
  max: number,
  names: Record<string, number> = {},
): boolean {
  return field.split(',').every((segment) => {
    const [base, step, extra] = segment.split('/');
    if (extra !== undefined) return false;
    if (step !== undefined && parseInteger(step, 1, max) === null) return false;
    if (base === '*') return true;

    const range = base.split('-');
    if (range.length === 1) return cronValue(range[0], min, max, names) !== null;
    if (range.length !== 2) return false;
    const start = cronValue(range[0], min, max, names);
    const end = cronValue(range[1], min, max, names);
    return start !== null && end !== null && start <= end;
  });
}

export function describeCronExpression(expression: string): string {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return 'Invalid cron expression';
  const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields;
  if (
    !isCronFieldValid(minuteField, 0, 59) ||
    !isCronFieldValid(hourField, 0, 23) ||
    !isCronFieldValid(dayOfMonth, 1, 31) ||
    !isCronFieldValid(month, 1, 12, MONTH_NAMES) ||
    !isCronFieldValid(dayOfWeek, 0, 7, WEEKDAY_NAMES)
  ) {
    return 'Invalid cron expression';
  }

  const minuteStep = minuteField.match(/^\*\/(\d+)$/)?.[1];
  if (minuteStep && hourField === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const interval = parseInteger(minuteStep, 1, 59);
    return interval ? `Every ${interval} minutes UTC` : 'Invalid cron expression';
  }

  const minute = parseInteger(minuteField, 0, 59);
  if (minute === null) return 'Invalid cron expression';
  if (hourField === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return minute === 0 ? 'Every hour UTC' : `Every hour at minute ${minute} UTC`;
  }

  const hour = parseInteger(hourField, 0, 23);
  if (hour === null || month !== '*') return `Cron schedule: ${expression.trim()} (UTC)`;
  const time = formatTime(hour, minute);

  if (dayOfMonth === '*') {
    if (dayOfWeek === '*') return `Every day at ${time} UTC`;
    if (dayOfWeek === '1-5') return `Every weekday at ${time} UTC`;
    const weekday = parseInteger(dayOfWeek, 0, 7);
    if (weekday !== null) return `Every ${WEEKDAYS[weekday % 7]} at ${time} UTC`;
  }

  if (dayOfWeek === '*') {
    const day = parseInteger(dayOfMonth, 1, 31);
    if (day !== null) return `Every month on day ${day} at ${time} UTC`;
  }

  return `Cron schedule: ${expression.trim()} (UTC)`;
}

export function CronPreview({ expression }: CronPreviewProps) {
  const description = describeCronExpression(expression);
  const invalid = description === 'Invalid cron expression';

  return (
    <p
      role="status"
      aria-live="polite"
      className={`text-xs ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}
    >
      {description}
    </p>
  );
}
