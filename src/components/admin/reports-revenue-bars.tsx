"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type RevenueBarBucket = {
  month: string; // YYYY-MM (SL)
  membership: number;
  admission: number;
};

const COLOR_MEMBERSHIP = "oklch(0.65 0.16 230)"; // blue
const COLOR_ADMISSION = "oklch(0.7 0.13 180)"; // teal

function formatMonthShort(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const name = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][m - 1];
  return `${name} ${String(y).slice(2)}`;
}

type TooltipEntry = { name: string; value: number; color: string };

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md min-w-[10rem]">
      <div className="font-medium mb-1.5">
        {label ? formatMonthShort(label) : ""}
      </div>
      {payload.map((p) => (
        <div
          key={p.name}
          className="flex items-center justify-between gap-3 text-muted-foreground"
        >
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-sm"
              style={{ background: p.color }}
            />
            {p.name}
          </span>
          <span className="tabular-nums text-foreground">
            {p.value.toLocaleString()}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 mt-1.5 pt-1.5 border-t text-foreground">
        <span className="font-medium">Total</span>
        <span className="tabular-nums font-semibold">
          LKR {total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function ReportsRevenueBars({
  buckets,
}: {
  buckets: RevenueBarBucket[];
}) {
  // Ensure chronological order on the x-axis even if the parent sorts desc.
  const data = [...buckets].sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <h4 className="text-sm font-medium">Monthly revenue</h4>
        <span className="text-xs text-muted-foreground">
          Stacked: membership + admission
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={data}
          margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthShort}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
            }
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={<CustomTooltip />}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value: string) => (
              <span className="text-muted-foreground">{value}</span>
            )}
          />
          <Bar
            dataKey="membership"
            name="Membership"
            stackId="rev"
            fill={COLOR_MEMBERSHIP}
            radius={[0, 0, 0, 0]}
          >
            {data.map((_, i) => (
              <Cell key={i} />
            ))}
          </Bar>
          <Bar
            dataKey="admission"
            name="Admission"
            stackId="rev"
            fill={COLOR_ADMISSION}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
