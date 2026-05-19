"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ReportsChartBucket = {
  month: string; // YYYY-MM in SL
  membershipNet: number;
  admissionNet: number;
};

type TooltipPayload = {
  value: number;
  name: string;
  color: string;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <div className="font-medium mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span
            className="inline-block size-2 rounded-sm"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto tabular-nums">
            {p.value.toLocaleString()}
          </span>
        </div>
      ))}
      <div className="mt-1 pt-1 border-t flex items-center gap-2">
        <span className="font-medium">Total</span>
        <span className="ml-auto font-medium tabular-nums">
          {total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function formatY(v: number): string {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}k`;
  return String(v);
}

export function ReportsChart({ buckets }: { buckets: ReportsChartBucket[] }) {
  // Page sorts months desc for the table; chart wants chronological ascending.
  const data = [...buckets].reverse();
  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <h4 className="text-sm font-medium mb-3">Revenue by month</h4>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="text-muted-foreground/20"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickLine={false}
            axisLine={false}
            className="text-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickFormatter={formatY}
            tickLine={false}
            axisLine={false}
            width={50}
            className="text-muted-foreground"
          />
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={<CustomTooltip />}
          />
          <Bar
            dataKey="membershipNet"
            name="Membership"
            stackId="rev"
            fill="oklch(0.6 0.22 27)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="admissionNet"
            name="Admission"
            stackId="rev"
            fill="oklch(0.6 0.22 27 / 50%)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
