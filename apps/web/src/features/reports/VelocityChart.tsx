import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SprintVelocity } from '@weaver/shared';

interface VelocityChartProps {
  data: SprintVelocity[];
}

export function VelocityChart({ data }: VelocityChartProps) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Complete a sprint to start tracking velocity.
      </p>
    );
  }

  return (
    <div className="w-full" aria-label="Project sprint velocity chart">
      <div className="w-full overflow-x-auto">
        <div className="h-72" style={{ minWidth: `${Math.max(320, data.length * 170)}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="sprintName"
                interval={0}
                angle={-20}
                textAnchor="end"
                height={58}
                tick={{ fontSize: 11 }}
              />
              <YAxis allowDecimals={false} className="text-xs" />
              <Tooltip />
              <Bar
                dataKey="committedPoints"
                name="Committed points"
                fill="var(--color-muted-foreground)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="completedPoints"
                name="Completed points"
                fill="var(--color-primary)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3" style={{ backgroundColor: 'var(--color-muted-foreground)' }} />
          Committed points
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3" style={{ backgroundColor: 'var(--color-primary)' }} />
          Completed points
        </span>
      </div>
    </div>
  );
}
