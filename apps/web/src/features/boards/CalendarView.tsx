import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProjectIssues, useProjectPlugins } from '@/api';
import { FeatureNotEnabled } from './FeatureNotEnabled';
import type { Issue } from '@weaver/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PRIORITY_COLORS: Record<string, string> = {
  highest: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
  lowest: 'bg-muted-foreground',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE = 3;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMonth(date: Date): string {
  return date.toLocaleString('en', { month: 'long', year: 'numeric' });
}

export function CalendarView() {
  const { projectKey = '' } = useParams<{ projectKey: string }>();
  const { data: projectPlugins } = useProjectPlugins(projectKey);

  if (projectPlugins && !projectPlugins.some((p) => p.pluginId === '@weaver/plugin-calendar')) {
    return <FeatureNotEnabled featureName="Calendar" projectKey={projectKey} />;
  }

  return <CalendarViewContent projectKey={projectKey} />;
}

function CalendarViewContent({ projectKey }: { projectKey: string }) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));

  // Calculate the 42-day grid range
  const { gridStart, gridEnd } = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gStart = new Date(monthStart);
    gStart.setDate(gStart.getDate() - gStart.getDay());
    const gEnd = new Date(monthEnd);
    gEnd.setDate(gEnd.getDate() + (6 - gEnd.getDay()));
    return { gridStart: gStart, gridEnd: gEnd };
  }, [currentMonth]);

  const { data, isLoading } = useProjectIssues({
    projectKey,
    all: true,
    dueDateFrom: formatDate(gridStart),
    dueDateTo: formatDate(gridEnd),
  });

  // Group issues by due date
  const issuesByDate = useMemo(() => {
    const map = new Map<string, Issue[]>();
    if (!data?.data) return map;
    for (const issue of data.data) {
      if (!issue.dueDate) continue;
      const existing = map.get(issue.dueDate) || [];
      existing.push(issue);
      map.set(issue.dueDate, existing);
    }
    return map;
  }, [data]);

  // Build calendar grid cells
  const cells = useMemo(() => {
    const result: Date[] = [];
    const d = new Date(gridStart);
    while (d <= gridEnd) {
      result.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [gridStart, gridEnd]);

  const today = formatDate(new Date());
  const currentMonthNum = currentMonth.getMonth();

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToday = () => {
    setCurrentMonth(startOfMonth(new Date()));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Calendar</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            Prev
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium text-foreground">
            {formatMonth(currentMonth)}
          </span>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            Next
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading calendar...</p>
        </div>
      ) : (
        <div>
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/50">
            {DAY_NAMES.map((day) => (
              <div key={day} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {cells.map((date) => {
              const dateStr = formatDate(date);
              const isToday = dateStr === today;
              const isCurrentMonth = date.getMonth() === currentMonthNum;
              const dayIssues = issuesByDate.get(dateStr) || [];
              const overflow = dayIssues.length - MAX_VISIBLE;

              return (
                <div
                  key={dateStr}
                  className={cn(
                    'min-h-[100px] border-b border-r border-border/50 p-1',
                    isCurrentMonth ? 'bg-card' : 'bg-muted/30',
                  )}
                >
                  <div
                    className={cn(
                      'mb-1 text-right text-xs font-medium',
                      isToday
                        ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground float-right'
                        : isCurrentMonth
                          ? 'text-foreground'
                          : 'text-muted-foreground',
                    )}
                  >
                    {date.getDate()}
                  </div>
                  <div className="clear-both space-y-0.5">
                    {dayIssues.slice(0, MAX_VISIBLE).map((issue) => (
                      <Link
                        key={issue.id}
                        to={`/issues/${issue.key}`}
                        className={cn(
                          'block truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white hover:opacity-80',
                          PRIORITY_COLORS[issue.priority] || 'bg-muted-foreground',
                        )}
                        title={`${issue.key}: ${issue.summary}`}
                      >
                        {issue.key} {issue.summary}
                      </Link>
                    ))}
                    {overflow > 0 && (
                      <span className="block px-1.5 text-[10px] text-muted-foreground">
                        +{overflow} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
