"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type ReportsChartBucket = {
  month: string;
  membershipNet: number;
  admissionNet: number;
};

const COLORS = {
  membership: "oklch(0.65 0.16 230)", // blue
  admission: "oklch(0.7 0.13 180)", // teal
};

type TooltipPayload = {
  value: number;
  name: string;
  payload: { name: string; value: number; percent: number };
};

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]!;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <div className="font-medium mb-0.5">{p.name}</div>
      <div className="text-muted-foreground tabular-nums">
        LKR {p.value.toLocaleString()}{" "}
        <span className="text-foreground/70">
          ({(p.payload.percent * 100).toFixed(1)}%)
        </span>
      </div>
    </div>
  );
}

export function ReportsChart({ buckets }: { buckets: ReportsChartBucket[] }) {
  const totalMembership = buckets.reduce((s, b) => s + b.membershipNet, 0);
  const totalAdmission = buckets.reduce((s, b) => s + b.admissionNet, 0);
  const grand = totalMembership + totalAdmission;

  const data = [
    {
      name: "Membership",
      value: Math.max(0, totalMembership),
      color: COLORS.membership,
      percent: grand > 0 ? totalMembership / grand : 0,
    },
    {
      name: "Admission",
      value: Math.max(0, totalAdmission),
      color: COLORS.admission,
      percent: grand > 0 ? totalAdmission / grand : 0,
    },
  ].filter((d) => d.value > 0);

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <h4 className="text-sm font-medium">Revenue breakdown</h4>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Total
          </div>
          <div className="text-lg font-semibold tabular-nums">
            LKR {grand.toLocaleString()}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value: string) => (
              <span className="text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
