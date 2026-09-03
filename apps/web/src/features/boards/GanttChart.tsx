import { useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectIssues, useProjectPlugins } from '@/api';
import { FeatureNotEnabled } from './FeatureNotEnabled';
import { cn } from '@/lib/utils';

interface GanttIssue {
  key: string;
  summary: string;
  priority: string;
  startDate: Date;
  endDate: Date;
  percentDone: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  highest: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
  lowest: 'bg-muted-foreground',
};

const DAY_WIDTH = 32;
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 56;
const LABEL_WIDTH = 240;
const DEFAULT_DURATION_DAYS = 7;

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatWeek(date: Date): string {
  const month = date.toLocaleString('en', { month: 'short' });
  return `${month} ${date.getDate()}`;
}

export function GanttChart() {
  const { projectKey = '' } = useParams<{ projectKey: string }>();
  const { data: projectPlugins } = useProjectPlugins(projectKey);

  if (projectPlugins && !projectPlugins.some((p) => p.pluginId === '@weaver/plugin-gantt')) {
    return <FeatureNotEnabled featureName="Gantt Chart" projectKey={projectKey} />;
  }

  return <GanttChartContent projectKey={projectKey} />;
}

function GanttChartContent({ projectKey }: { projectKey: string }) {
  const { data, isLoading, isError } = useProjectIssues({ projectKey, perPage: 100 });
  const scrollRef = useRef<HTMLDivElement>(null);

  const { issues, timelineStart, totalDays, weeks } = useMemo(() => {
    if (!data?.data || data.data.length === 0) {
      return { issues: [], timelineStart: new Date(), totalDays: 28, weeks: [] };
    }

    // Only include issues with at least one date set
    const datedIssues = data.data.filter((issue) => issue.startDate || issue.dueDate);
    if (datedIssues.length === 0) {
      return { issues: [], timelineStart: new Date(), totalDays: 28, weeks: [] };
    }

    const ganttIssues: GanttIssue[] = datedIssues.map((issue) => {
      let start: Date;
      let end: Date;

      if (issue.startDate && issue.dueDate) {
        start = new Date(issue.startDate);
        end = new Date(issue.dueDate);
      } else if (issue.startDate) {
        start = new Date(issue.startDate);
        end = addDays(start, DEFAULT_DURATION_DAYS);
      } else {
        end = new Date(issue.dueDate!);
        start = addDays(end, -DEFAULT_DURATION_DAYS);
      }

      return {
        key: issue.key,
        summary: issue.summary,
        priority: issue.priority,
        startDate: start,
        endDate: end.getTime() <= start.getTime() ? addDays(start, 1) : end,
        percentDone: issue.percentDone ?? 0,
      };
    });

    const minDate = ganttIssues.reduce(
      (min, issue) => (issue.startDate < min ? issue.startDate : min),
      ganttIssues[0].startDate,
    );
    const maxDate = ganttIssues.reduce(
      (max, issue) => (issue.endDate > max ? issue.endDate : max),
      ganttIssues[0].endDate,
    );

    const tlStart = startOfWeek(addDays(minDate, -3));
    const tlEnd = addDays(maxDate, 7);
    const total = daysBetween(tlStart, tlEnd);

    const weekList: Date[] = [];
    let weekStart = new Date(tlStart);
    while (weekStart < tlEnd) {
      weekList.push(new Date(weekStart));
      weekStart = addDays(weekStart, 7);
    }

    return {
      issues: ganttIssues,
      timelineStart: tlStart,
      totalDays: total,
      weeks: weekList,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading Gantt chart...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-destructive">Failed to load issues for Gantt chart.</p>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">No issues with dates to display.</p>
        <p className="mt-1 text-sm text-muted-foreground">Set start or due dates on issues to see them on the Gantt chart.</p>
      </div>
    );
  }

  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = issues.length * ROW_HEIGHT + HEADER_HEIGHT;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Gantt Chart</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Timeline view of {issues.length} issues
        </p>
      </div>

      <div className="flex">
        {/* Issue labels column */}
        <div
          className="flex-shrink-0 border-r border-border"
          style={{ width: LABEL_WIDTH }}
        >
          {/* Header spacer */}
          <div
            className="border-b border-border bg-muted/50 px-3 py-2"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-xs font-medium text-muted-foreground">Issue</span>
          </div>

          {/* Issue labels */}
          {issues.map((issue) => (
            <div
              key={issue.key}
              className="flex items-center border-b border-border/50 px-3"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="mr-2 text-xs font-medium text-primary">
                {issue.key}
              </span>
              <span className="truncate text-xs text-foreground">{issue.summary}</span>
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div className="flex-1 overflow-x-auto" ref={scrollRef}>
          <div style={{ width: chartWidth, height: chartHeight }} className="relative">
            {/* Week headers */}
            <div
              className="sticky top-0 flex border-b border-border bg-muted/50"
              style={{ height: HEADER_HEIGHT }}
            >
              {weeks.map((weekDate, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 border-r border-border/30 px-2 py-2"
                  style={{ width: 7 * DAY_WIDTH }}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {formatWeek(weekDate)}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid rows and bars */}
            {issues.map((issue, rowIndex) => {
              const offsetDays = daysBetween(timelineStart, issue.startDate);
              const durationDays = daysBetween(issue.startDate, issue.endDate);
              const left = Math.max(0, offsetDays * DAY_WIDTH);
              const width = Math.max(DAY_WIDTH, durationDays * DAY_WIDTH);
              const top = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
              const barColor = PRIORITY_COLORS[issue.priority] || 'bg-muted-foreground';

              return (
                <div key={issue.key}>
                  {/* Row background */}
                  <div
                    className={cn(
                      'absolute border-b border-border/30',
                      rowIndex % 2 === 0 ? 'bg-card' : 'bg-muted/20',
                    )}
                    style={{
                      top,
                      left: 0,
                      width: chartWidth,
                      height: ROW_HEIGHT,
                    }}
                  />

                  {/* Bar */}
                  <div
                    className={cn(
                      'absolute flex items-center overflow-hidden rounded cursor-default shadow-sm',
                      `${barColor}/40`,
                    )}
                    style={{
                      top: top + 8,
                      left,
                      width,
                      height: ROW_HEIGHT - 16,
                    }}
                    title={`${issue.key}: ${issue.summary} (${issue.percentDone}%)`}
                  >
                    {/* Progress fill */}
                    <div
                      className={cn('absolute inset-y-0 left-0', barColor)}
                      style={{ width: `${issue.percentDone}%` }}
                    />
                    <span className="relative z-10 truncate px-2 text-[10px] font-medium text-white">
                      {issue.key}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Today line */}
            {(() => {
              const todayOffset = daysBetween(timelineStart, new Date());
              if (todayOffset >= 0 && todayOffset <= totalDays) {
                return (
                  <div
                    className="absolute top-0 w-px bg-red-500"
                    style={{
                      left: todayOffset * DAY_WIDTH,
                      height: chartHeight,
                    }}
                  />
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 border-t border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">Priority:</span>
        {Object.entries(PRIORITY_COLORS).map(([priority, color]) => (
          <div key={priority} className="flex items-center gap-1">
            <div className={cn('h-2.5 w-2.5 rounded-sm', color)} />
            <span className="text-xs capitalize text-muted-foreground">{priority}</span>
          </div>
        ))}
        <div className="ml-4 flex items-center gap-1">
          <div className="h-3 w-px bg-red-500" />
          <span className="text-xs text-muted-foreground">Today</span>
        </div>
      </div>
    </div>
  );
}
