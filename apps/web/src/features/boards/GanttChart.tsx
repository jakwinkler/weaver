import { useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useProjectIssues } from '@/api';

interface GanttIssue {
  key: string;
  summary: string;
  priority: string;
  startDate: Date;
  endDate: Date;
}

const PRIORITY_COLORS: Record<string, string> = {
  highest: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
  lowest: 'bg-gray-400',
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
  const { data, isLoading, isError } = useProjectIssues({ projectKey, perPage: 100 });
  const scrollRef = useRef<HTMLDivElement>(null);

  const { issues, timelineStart, totalDays, weeks } = useMemo(() => {
    if (!data?.data || data.data.length === 0) {
      return { issues: [], timelineStart: new Date(), totalDays: 28, weeks: [] };
    }

    const ganttIssues: GanttIssue[] = data.data.map((issue) => {
      const start = issue.createdAt ? new Date(issue.createdAt as unknown as string) : new Date();
      const dueDate = (issue.customFields as Record<string, unknown>)?.dueDate;
      const end = dueDate
        ? new Date(dueDate as string)
        : addDays(start, DEFAULT_DURATION_DAYS);
      return {
        key: issue.key,
        summary: issue.summary,
        priority: issue.priority,
        startDate: start,
        endDate: end.getTime() <= start.getTime() ? addDays(start, 1) : end,
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
        <p className="text-gray-500">Loading Gantt chart...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-red-500">Failed to load issues for Gantt chart.</p>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-500">No issues to display. Create some issues first.</p>
      </div>
    );
  }

  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = issues.length * ROW_HEIGHT + HEADER_HEIGHT;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Gantt Chart</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Timeline view of {issues.length} issues
        </p>
      </div>

      <div className="flex">
        {/* Issue labels column */}
        <div
          className="flex-shrink-0 border-r border-gray-200"
          style={{ width: LABEL_WIDTH }}
        >
          {/* Header spacer */}
          <div
            className="border-b border-gray-200 bg-gray-50 px-3 py-2"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-xs font-medium text-gray-500">Issue</span>
          </div>

          {/* Issue labels */}
          {issues.map((issue) => (
            <div
              key={issue.key}
              className="flex items-center border-b border-gray-100 px-3"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="mr-2 text-xs font-medium text-indigo-600">
                {issue.key}
              </span>
              <span className="truncate text-xs text-gray-700">{issue.summary}</span>
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div className="flex-1 overflow-x-auto" ref={scrollRef}>
          <div style={{ width: chartWidth, height: chartHeight }} className="relative">
            {/* Week headers */}
            <div
              className="sticky top-0 flex border-b border-gray-200 bg-gray-50"
              style={{ height: HEADER_HEIGHT }}
            >
              {weeks.map((weekDate, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 border-r border-gray-100 px-2 py-2"
                  style={{ width: 7 * DAY_WIDTH }}
                >
                  <span className="text-xs font-medium text-gray-600">
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
              const barColor = PRIORITY_COLORS[issue.priority] || 'bg-gray-400';

              return (
                <div key={issue.key}>
                  {/* Row background */}
                  <div
                    className={`absolute border-b border-gray-50 ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                    style={{
                      top,
                      left: 0,
                      width: chartWidth,
                      height: ROW_HEIGHT,
                    }}
                  />

                  {/* Bar */}
                  <div
                    className={`absolute flex items-center rounded px-2 ${barColor} cursor-default shadow-sm`}
                    style={{
                      top: top + 8,
                      left,
                      width,
                      height: ROW_HEIGHT - 16,
                    }}
                    title={`${issue.key}: ${issue.summary}`}
                  >
                    <span className="truncate text-[10px] font-medium text-white">
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
      <div className="flex items-center gap-4 border-t border-gray-200 px-4 py-2">
        <span className="text-xs text-gray-500">Priority:</span>
        {Object.entries(PRIORITY_COLORS).map(([priority, color]) => (
          <div key={priority} className="flex items-center gap-1">
            <div className={`h-2.5 w-2.5 rounded-sm ${color}`} />
            <span className="text-xs capitalize text-gray-600">{priority}</span>
          </div>
        ))}
        <div className="ml-4 flex items-center gap-1">
          <div className="h-3 w-px bg-red-500" />
          <span className="text-xs text-gray-600">Today</span>
        </div>
      </div>
    </div>
  );
}
