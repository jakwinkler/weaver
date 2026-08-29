import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BurndownDataPoint } from '@weaver/shared';

interface BurndownChartProps {
  data: BurndownDataPoint[];
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function BurndownChart({ data }: BurndownChartProps) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">No burndown data yet.</p>;
  }

  return (
    <div className="h-80 w-full" aria-label="Sprint burndown chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" />
          <YAxis allowDecimals={false} className="text-xs" />
          <Tooltip labelFormatter={(value) => formatDate(String(value))} />
          <Legend />
          <Line
            type="monotone"
            dataKey="idealRemaining"
            name="Ideal remaining"
            stroke="var(--color-muted-foreground)"
            strokeDasharray="6 4"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="remainingPoints"
            name="Actual remaining"
            stroke="var(--color-primary)"
            strokeWidth={3}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
