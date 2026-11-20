import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { Category, Decision, SecurityEvent, TimeSeriesPoint } from "../types";
import { CATEGORY_META } from "../lib/mock";
import { cn, formatNumber } from "../lib/utils";

const AXIS = { fill: "#74849C", fontSize: 10.5 };
const GRID = "#1B2637";

const tooltipShell =
  "rounded-md border border-line-strong bg-[#0B111B] px-3 py-2 shadow-pop text-xs";

function ActivityTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className={tooltipShell}>
      <p className="mb-1.5 text-2xs uppercase tracking-wider text-ink-faint">
        {new Date(String(label)).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
      </p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: entry.color }} />
            <span className="capitalize">{entry.dataKey}</span>
          </span>
          <span className="font-mono text-ink-secondary">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ActivityChart({ data }: { data: TimeSeriesPoint[] }) {
  return (
    <div className="h-[232px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="fillAllowed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#34D399" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillSanitized" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#FBBF24" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillBlocked" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FB7185" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#FB7185" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
            tickFormatter={(value: string) =>
              new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            }
          />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={42} allowDecimals={false} />
          <Tooltip content={<ActivityTooltip />} cursor={{ stroke: "#2A3A52", strokeDasharray: "3 3" }} />
          <Area
            type="monotone"
            dataKey="allowed"
            stackId="1"
            stroke="#34D399"
            strokeWidth={1.4}
            fill="url(#fillAllowed)"
          />
          <Area
            type="monotone"
            dataKey="sanitized"
            stackId="1"
            stroke="#FBBF24"
            strokeWidth={1.4}
            fill="url(#fillSanitized)"
          />
          <Area
            type="monotone"
            dataKey="blocked"
            stackId="1"
            stroke="#FB7185"
            strokeWidth={1.4}
            fill="url(#fillBlocked)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-2xs text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

const DECISION_COLORS: Record<Decision, string> = {
  allow: "#34D399",
  sanitize: "#FBBF24",
  block: "#FB7185",
};

export function DecisionDonut({ counts }: { counts: Record<Decision, number> }) {
  const data = (Object.keys(DECISION_COLORS) as Decision[]).map((decision) => ({
    name: decision,
    value: counts[decision],
    color: DECISION_COLORS[decision],
  }));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="relative h-[178px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={56}
            outerRadius={76}
            paddingAngle={2}
            stroke="#0C121C"
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0];
              const value = Number(item?.value ?? 0);
              return (
                <div className={tooltipShell}>
                  <span className="capitalize text-ink-muted">{String(item?.name)}</span>
                  <span className="ml-3 font-mono text-ink">{value}</span>
                  <span className="ml-2 text-ink-faint">
                    {total ? `${((value / total) * 100).toFixed(0)}%` : "0%"}
                  </span>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl font-semibold text-ink">{formatNumber(total)}</span>
        <span className="text-2xs uppercase tracking-wider text-ink-faint">requests</span>
      </div>
    </div>
  );
}

export function ThreatBars({ data }: { data: { category: Category; count: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[178px] items-center justify-center text-xs text-ink-faint">
        No threat categories in this period.
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex h-[178px] flex-col justify-center gap-2.5">
      {data.slice(0, 6).map((item) => (
        <div key={item.category}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-ink-secondary">{CATEGORY_META[item.category].label}</span>
            <span className="font-mono text-2xs text-ink-muted">{item.count}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SessionRiskChart({ events }: { events: SecurityEvent[] }) {
  const data = [...events]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((event) => ({
      time: new Date(event.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      score: event.final_score,
      decision: event.decision,
    }));

  if (data.length === 0) {
    return <div className="flex h-[180px] items-center justify-center text-xs text-ink-faint">No events.</div>;
  }

  return (
    <div className="h-[190px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -22 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="time" tick={AXIS} axisLine={false} tickLine={false} minTickGap={30} />
          <YAxis domain={[0, 1]} tick={AXIS} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as { time: string; score: number; decision: string } | undefined;
              if (!point) return null;
              return (
                <div className={tooltipShell}>
                  <p className="text-2xs text-ink-faint">{point.time}</p>
                  <p className="mt-1 flex items-center justify-between gap-4">
                    <span className="capitalize text-ink-muted">{point.decision}</span>
                    <span className="font-mono text-ink">{point.score.toFixed(2)}</span>
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="stepAfter"
            dataKey="score"
            stroke="#22D3EE"
            strokeWidth={1.6}
            dot={{ r: 2.5, fill: "#22D3EE", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryRecallChart({
  data,
}: {
  data: { category: Category; recall: number; support: number }[];
}) {
  return (
    <div className="h-[210px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 1]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={AXIS}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="category"
            tick={{ ...AXIS, fontSize: 10 }}
            tickFormatter={(value: Category) => CATEGORY_META[value].short}
            width={72}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(34,211,238,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as
                | { category: Category; recall: number; support: number }
                | undefined;
              if (!row) return null;
              return (
                <div className={tooltipShell}>
                  <p className="text-ink-secondary">{CATEGORY_META[row.category].label}</p>
                  <p className="mt-1 flex justify-between gap-4 text-ink-muted">
                    <span>Recall</span>
                    <span className="font-mono text-ink">{(row.recall * 100).toFixed(1)}%</span>
                  </p>
                  <p className="flex justify-between gap-4 text-ink-muted">
                    <span>Support</span>
                    <span className="font-mono text-ink">{row.support}</span>
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="recall" radius={[0, 3, 3, 0]} barSize={12} fill="#22D3EE" fillOpacity={0.7} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniBars({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className={cn("flex h-8 items-end gap-0.5", className)} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-1 rounded-sm bg-accent/40"
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
