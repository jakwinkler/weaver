import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import type { RoadmapEpic } from '@weaver/shared';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDotDashed,
  GripVertical,
  LocateFixed,
} from 'lucide-react';
import { useHasPermission, useProject, useResizeRoadmapEpic, useRoadmapEpics } from '@/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  buildTimeline,
  dateToTimelineX,
  formatDate,
  parseDate,
  resizeEpicRange,
  timelineXToDate,
  type RoadmapTimeline,
  type TimelineZoom,
} from './roadmapTimeline';

const HEADER_HEIGHT = 64;
const EPIC_ROW_HEIGHT = 72;
const CHILD_ROW_HEIGHT = 34;
const BAR_HEIGHT = 38;
const MIN_BAR_WIDTH = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

interface EpicRange {
  startDate: string;
  dueDate: string;
}

interface RowLayout {
  top: number;
  height: number;
  barCenterY: number;
}

interface DragState {
  epicId: string;
  issueKey: string;
  edge: 'start' | 'end';
  pointerStartX: number;
  initialRange: EpicRange;
  previewRange: EpicRange;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function rangeForEpic(epic: RoadmapEpic): EpicRange | null {
  if (epic.startDate && epic.dueDate) {
    return {
      startDate: epic.startDate,
      dueDate: epic.dueDate < epic.startDate ? epic.startDate : epic.dueDate,
    };
  }
  if (epic.startDate) {
    return {
      startDate: epic.startDate,
      dueDate: formatDate(addDays(parseDate(epic.startDate), 30)),
    };
  }
  if (epic.dueDate) {
    return {
      startDate: formatDate(addDays(parseDate(epic.dueDate), -30)),
      dueDate: epic.dueDate,
    };
  }
  return null;
}

function percent(value: number): number {
  return Math.round(Math.min(Math.max(value, 0), 1) * 100);
}

function statusColor(color: string | undefined): string {
  return /^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : '#64748b';
}

function dependencyPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): string {
  const direction = targetX >= sourceX ? 1 : -1;
  const bend = Math.max(28, Math.abs(targetX - sourceX) * 0.35);
  return `M ${sourceX} ${sourceY} C ${sourceX + bend * direction} ${sourceY}, ${targetX - bend * direction} ${targetY}, ${targetX} ${targetY}`;
}

function useRowLayouts(epics: RoadmapEpic[], expanded: Set<string>) {
  return useMemo(() => {
    const layouts = new Map<string, RowLayout>();
    let top = 0;
    for (const epic of epics) {
      const childHeight = expanded.has(epic.id) ? epic.children.length * CHILD_ROW_HEIGHT : 0;
      const height = EPIC_ROW_HEIGHT + childHeight;
      layouts.set(epic.id, {
        top,
        height,
        barCenterY: HEADER_HEIGHT + top + EPIC_ROW_HEIGHT / 2,
      });
      top += height;
    }
    return { layouts, rowsHeight: top };
  }, [epics, expanded]);
}

export function RoadmapView() {
  const { projectKey = '' } = useParams<{ projectKey: string }>();
  const { data: project } = useProject(projectKey);
  const { data: epics = [], isLoading, isError } = useRoadmapEpics(projectKey);
  const { mutate: resizeEpic, isPending: isResizePending } = useResizeRoadmapEpic(projectKey);
  const canEdit = useHasPermission('issues.update');
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [zoom, setZoom] = useState<TimelineZoom>('month');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resizeError, setResizeError] = useState<string | null>(null);
  const isDragging = drag !== null;

  const timeline = useMemo(
    () =>
      buildTimeline(
        epics.map((epic) => ({ startDate: epic.startDate, dueDate: epic.dueDate })),
        zoom,
      ),
    [epics, zoom],
  );
  const { layouts, rowsHeight } = useRowLayouts(epics, expanded);
  const chartHeight = HEADER_HEIGHT + rowsHeight;

  const displayedRanges = useMemo(() => {
    const ranges = new Map<string, EpicRange | null>();
    for (const epic of epics) {
      ranges.set(epic.id, drag?.epicId === epic.id ? drag.previewRange : rangeForEpic(epic));
    }
    return ranges;
  }, [drag, epics]);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }, []);
  const todayX = dateToTimelineX(today, timeline);

  const toggleExpanded = useCallback((epicId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(epicId)) next.delete(epicId);
      else next.add(epicId);
      return next;
    });
  }, []);

  const scrollTimeline = useCallback((direction: -1 | 1) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(element.clientWidth * 0.75, 240),
      behavior: 'smooth',
    });
  }, []);

  const scrollToToday = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({
      left: Math.max(0, todayX - element.clientWidth / 2),
      behavior: 'smooth',
    });
  }, [todayX]);

  const beginResize = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      epic: RoadmapEpic,
      edge: 'start' | 'end',
      range: EpicRange,
    ) => {
      if (!canEdit) return;
      event.preventDefault();
      event.stopPropagation();
      setResizeError(null);
      const nextDrag: DragState = {
        epicId: epic.id,
        issueKey: epic.key,
        edge,
        pointerStartX: event.clientX,
        initialRange: range,
        previewRange: range,
      };
      dragRef.current = nextDrag;
      setDrag(nextDrag);
    },
    [canEdit],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const activeDrag = dragRef.current;
      if (!activeDrag) return;
      const edgeDate =
        activeDrag.edge === 'start'
          ? parseDate(activeDrag.initialRange.startDate)
          : parseDate(activeDrag.initialRange.dueDate);
      const edgeX = dateToTimelineX(edgeDate, timeline);
      const nextDate = timelineXToDate(edgeX + event.clientX - activeDrag.pointerStartX, timeline);
      const previewRange = resizeEpicRange(activeDrag.initialRange, activeDrag.edge, nextDate);
      const nextDrag = { ...activeDrag, previewRange };
      dragRef.current = nextDrag;
      setDrag(nextDrag);
    };

    const handlePointerUp = () => {
      const activeDrag = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!activeDrag || activeDrag.previewRange === activeDrag.initialRange) return;
      if (
        activeDrag.previewRange.startDate === activeDrag.initialRange.startDate &&
        activeDrag.previewRange.dueDate === activeDrag.initialRange.dueDate
      ) {
        return;
      }
      resizeEpic(
        {
          issueKey: activeDrag.issueKey,
          startDate: activeDrag.previewRange.startDate,
          dueDate: activeDrag.previewRange.dueDate,
        },
        {
          onError: () => setResizeError('The epic dates could not be updated. Please try again.'),
        },
      );
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, resizeEpic, timeline]);

  if (isLoading) {
    return <RoadmapMessage>Loading roadmap...</RoadmapMessage>;
  }

  if (isError) {
    return <RoadmapMessage error>Failed to load the project roadmap.</RoadmapMessage>;
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <Link to={`/projects/${projectKey}`} className="hover:text-foreground">
              {project?.name ?? projectKey}
            </Link>
            <span aria-hidden="true">/</span>
            <span>Planning</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Roadmap</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Epic timing, delivery progress, and cross-epic dependencies.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border border-border bg-card p-0.5" aria-label="Timeline zoom">
            {(['month', 'quarter'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setZoom(value)}
                aria-pressed={zoom === value}
                className={cn(
                  'px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                  zoom === value
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={scrollToToday}>
            <LocateFixed />
            Today
          </Button>
          <div className="flex">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-r-0"
              onClick={() => scrollTimeline(-1)}
              aria-label="Scroll timeline left"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => scrollTimeline(1)}
              aria-label="Scroll timeline right"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>

      {resizeError && (
        <p
          role="alert"
          className="border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {resizeError}
        </p>
      )}

      {epics.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-border bg-card px-6 text-center">
          <CircleDotDashed className="mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">No epics on this roadmap</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Create an issue with the Epic type, then add dates directly or assign dated child
            issues.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden border border-border bg-card shadow-sm">
          <div className="flex min-w-0">
            <div className="z-20 w-48 flex-none border-r border-border bg-card sm:w-56 md:w-72">
              <div
                className="flex items-center border-b border-border bg-muted/40 px-3"
                style={{ height: HEADER_HEIGHT }}
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Epics
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{epics.length} planned</p>
                </div>
              </div>
              {epics.map((epic) => (
                <EpicLabel
                  key={epic.id}
                  epic={epic}
                  expanded={expanded.has(epic.id)}
                  onToggle={() => toggleExpanded(epic.id)}
                />
              ))}
            </div>

            <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
              <div className="relative" style={{ width: timeline.width, height: chartHeight }}>
                <TimelineHeader timeline={timeline} />
                <TimelineGrid timeline={timeline} height={chartHeight} />

                {epics.map((epic, rowIndex) => {
                  const layout = layouts.get(epic.id)!;
                  const range = displayedRanges.get(epic.id);
                  return (
                    <EpicTimelineRow
                      key={epic.id}
                      epic={epic}
                      layout={layout}
                      range={range}
                      timeline={timeline}
                      rowIndex={rowIndex}
                      expanded={expanded.has(epic.id)}
                      canEdit={canEdit}
                      isResizing={drag?.epicId === epic.id}
                      onToggle={() => toggleExpanded(epic.id)}
                      onResizeStart={beginResize}
                    />
                  );
                })}

                <DependencyLines
                  epics={epics}
                  ranges={displayedRanges}
                  layouts={layouts}
                  timeline={timeline}
                  height={chartHeight}
                />

                {todayX >= 0 && todayX <= timeline.width && (
                  <div
                    className="pointer-events-none absolute top-0 z-10 border-l border-dashed border-red-500/80"
                    style={{ left: todayX, height: chartHeight }}
                  >
                    <span className="absolute left-1 top-1 bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Today
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span>Bar fill shows completed child issues.</span>
            <span>
              {canEdit
                ? 'Drag either bar edge to adjust epic dates.'
                : 'Date changes require issue edit access.'}
            </span>
            {isResizePending && <span>Saving epic dates...</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function RoadmapMessage({ children, error = false }: { children: string; error?: boolean }) {
  return (
    <div className="flex items-center justify-center py-16">
      <p className={error ? 'text-destructive' : 'text-muted-foreground'}>{children}</p>
    </div>
  );
}

function EpicLabel({
  epic,
  expanded,
  onToggle,
}: {
  epic: RoadmapEpic;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border/70">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        style={{ height: EPIC_ROW_HEIGHT }}
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-none text-muted-foreground transition-transform',
            !expanded && '-rotate-90',
          )}
        />
        <span
          className="h-2.5 w-2.5 flex-none rounded-full"
          style={{ backgroundColor: statusColor(epic.status.color) }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="whitespace-nowrap font-mono text-[11px] font-semibold text-primary">
              {epic.key}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">{epic.summary}</span>
          </span>
          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{percent(epic.progress)}% complete</span>
            <span aria-hidden="true">·</span>
            <span>{epic.totalStoryPoints} pts</span>
          </span>
        </span>
      </button>
      {expanded &&
        epic.children.map((child) => (
          <Link
            key={child.id}
            to={`/issues/${child.key}`}
            className="flex items-center gap-2 border-t border-border/40 bg-muted/20 pl-9 pr-3 text-xs hover:bg-muted/50"
            style={{ height: CHILD_ROW_HEIGHT }}
          >
            <span
              className="h-1.5 w-1.5 flex-none rounded-full"
              style={{ backgroundColor: statusColor(child.status.color) }}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap font-mono text-[10px] font-semibold text-primary">
              {child.key}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">{child.summary}</span>
            {child.storyPoints !== null && (
              <span className="flex-none text-muted-foreground">{child.storyPoints}</span>
            )}
          </Link>
        ))}
    </div>
  );
}

function TimelineHeader({ timeline }: { timeline: RoadmapTimeline }) {
  return (
    <div
      className="absolute inset-x-0 top-0 z-[2] flex border-b border-border bg-muted/40"
      style={{ height: HEADER_HEIGHT }}
    >
      {timeline.periods.map((period) => (
        <div
          key={period.key}
          className="flex flex-none items-end border-r border-border/70 px-3 pb-3"
          style={{ width: period.width }}
        >
          <span className="text-xs font-semibold text-foreground">{period.label}</span>
        </div>
      ))}
    </div>
  );
}

function TimelineGrid({ timeline, height }: { timeline: RoadmapTimeline; height: number }) {
  let offset = 0;
  return (
    <>
      {timeline.periods.map((period, index) => {
        const left = offset;
        offset += period.width;
        return (
          <div
            key={period.key}
            className={cn(
              'pointer-events-none absolute top-0 border-r border-border/60',
              index % 2 === 1 && 'bg-muted/10',
            )}
            style={{ left, width: period.width, height }}
          />
        );
      })}
    </>
  );
}

function EpicTimelineRow({
  epic,
  layout,
  range,
  timeline,
  rowIndex,
  expanded,
  canEdit,
  isResizing,
  onToggle,
  onResizeStart,
}: {
  epic: RoadmapEpic;
  layout: RowLayout;
  range: EpicRange | null | undefined;
  timeline: RoadmapTimeline;
  rowIndex: number;
  expanded: boolean;
  canEdit: boolean;
  isResizing: boolean;
  onToggle: () => void;
  onResizeStart: (
    event: ReactPointerEvent<HTMLButtonElement>,
    epic: RoadmapEpic,
    edge: 'start' | 'end',
    range: EpicRange,
  ) => void;
}) {
  const rowTop = HEADER_HEIGHT + layout.top;
  const color = statusColor(epic.status.color);

  if (!range) {
    return (
      <div
        className={cn(
          'absolute inset-x-0 border-b border-border/70',
          rowIndex % 2 === 1 && 'bg-muted/10',
        )}
        style={{ top: rowTop, height: layout.height }}
      >
        <div
          className="flex items-center px-4 text-xs text-muted-foreground"
          style={{ height: EPIC_ROW_HEIGHT }}
        >
          Add dates to this epic or its children to place it on the timeline.
        </div>
      </div>
    );
  }

  const left = dateToTimelineX(parseDate(range.startDate), timeline);
  const dueX = dateToTimelineX(addDays(parseDate(range.dueDate), 1), timeline);
  const width = Math.max(MIN_BAR_WIDTH, dueX - left);
  const barTop = rowTop + (EPIC_ROW_HEIGHT - BAR_HEIGHT) / 2;

  return (
    <div
      className={cn(
        'absolute inset-x-0 border-b border-border/70',
        rowIndex % 2 === 1 && 'bg-muted/10',
      )}
      style={{ top: rowTop, height: layout.height }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          'group absolute z-[4] flex cursor-pointer items-center overflow-hidden border bg-card shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring',
          isResizing && 'ring-2 ring-ring',
        )}
        style={{ top: barTop - rowTop, left, width, height: BAR_HEIGHT, borderColor: color }}
        title={`${epic.key}: ${range.startDate} to ${range.dueDate}`}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{ width: `${percent(epic.progress)}%`, backgroundColor: color, opacity: 0.32 }}
        />
        {canEdit && (
          <button
            type="button"
            className="absolute inset-y-0 left-0 z-10 flex w-3 touch-none cursor-ew-resize items-center justify-center bg-card/70 opacity-0 transition-opacity hover:bg-card focus:opacity-100 group-hover:opacity-100"
            onPointerDown={(event) => onResizeStart(event, epic, 'start', range)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Resize ${epic.key} start date`}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
        <span className="relative z-[1] min-w-0 flex-1 truncate px-3 text-xs font-semibold text-foreground">
          {epic.summary}
        </span>
        <span className="relative z-[1] mr-3 flex-none bg-card/80 px-1.5 py-0.5 text-[10px] font-bold text-foreground">
          {percent(epic.progress)}%
        </span>
        {canEdit && (
          <button
            type="button"
            className="absolute inset-y-0 right-0 z-10 flex w-3 touch-none cursor-ew-resize items-center justify-center bg-card/70 opacity-0 transition-opacity hover:bg-card focus:opacity-100 group-hover:opacity-100"
            onPointerDown={(event) => onResizeStart(event, epic, 'end', range)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Resize ${epic.key} due date`}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {expanded &&
        epic.children.map((child, index) => {
          const childTop = EPIC_ROW_HEIGHT + index * CHILD_ROW_HEIGHT;
          const childRange = rangeForEpic({
            ...epic,
            startDate: child.startDate,
            dueDate: child.dueDate,
          });
          if (!childRange) return null;
          const childLeft = dateToTimelineX(parseDate(childRange.startDate), timeline);
          const childDueX = dateToTimelineX(addDays(parseDate(childRange.dueDate), 1), timeline);
          return (
            <div
              key={child.id}
              className="absolute h-1.5 bg-muted-foreground/35"
              style={{
                top: childTop + CHILD_ROW_HEIGHT / 2 - 3,
                left: childLeft,
                width: Math.max(8, childDueX - childLeft),
              }}
              title={`${child.key}: ${childRange.startDate} to ${childRange.dueDate}`}
            />
          );
        })}
    </div>
  );
}

function DependencyLines({
  epics,
  ranges,
  layouts,
  timeline,
  height,
}: {
  epics: RoadmapEpic[];
  ranges: Map<string, EpicRange | null>;
  layouts: Map<string, RowLayout>;
  timeline: RoadmapTimeline;
  height: number;
}) {
  const paths = epics.flatMap((source) => {
    const sourceRange = ranges.get(source.id);
    const sourceLayout = layouts.get(source.id);
    if (!sourceRange || !sourceLayout) return [];
    const sourceX = dateToTimelineX(addDays(parseDate(sourceRange.dueDate), 1), timeline);

    return source.blockingEpicIds.flatMap((targetId) => {
      const targetRange = ranges.get(targetId);
      const targetLayout = layouts.get(targetId);
      if (!targetRange || !targetLayout) return [];
      const targetX = dateToTimelineX(parseDate(targetRange.startDate), timeline);
      return [
        {
          key: `${source.id}-${targetId}`,
          d: dependencyPath(sourceX, sourceLayout.barCenterY, targetX, targetLayout.barCenterY),
        },
      ];
    });
  });

  if (paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] overflow-visible"
      width={timeline.width}
      height={height}
      aria-label={`${paths.length} epic dependencies`}
    >
      <defs>
        <marker
          id="roadmap-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" className="fill-muted-foreground" />
        </marker>
      </defs>
      {paths.map((path) => (
        <path
          key={path.key}
          d={path.d}
          fill="none"
          className="stroke-muted-foreground/70"
          strokeWidth="1.5"
          markerEnd="url(#roadmap-arrow)"
        />
      ))}
    </svg>
  );
}
