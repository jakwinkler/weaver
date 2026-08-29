import type { SprintSummary as SprintSummaryData } from '@weaver/shared';

interface SprintSummaryProps {
  summary: SprintSummaryData;
}

const numberFormatter = new Intl.NumberFormat();

export function SprintSummary({ summary }: SprintSummaryProps) {
  const stats = [
    { label: 'Total issues', value: summary.totalIssues },
    { label: 'Completed', value: summary.completedIssues },
    { label: 'Added mid-sprint', value: summary.addedMidSprint },
    { label: 'Removed mid-sprint', value: summary.removedMidSprint },
    { label: 'Carry-over points', value: summary.carryOverPoints },
    { label: 'Completion', value: `${numberFormatter.format(summary.completionPercentage)}%` },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-lg border bg-muted/30 p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {stat.label}
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
