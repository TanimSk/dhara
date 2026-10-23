import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Validated pair (dataviz validator, light surface): slot 1 blue, clay accent.
export const SERIES = { primary: "#2a78d6", secondary: "#c96442" };
const GRID = "#ecebe6";
const AXIS = "#8a8a8f";

const tickStyle = { fontSize: 11.5, fill: AXIS };

function shortDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function ChartTooltip({ active, payload, label, format, labelFormat }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface/95 backdrop-blur px-3 py-2 shadow-float text-[12.5px]">
      <div className="text-ink-3 mb-1">{labelFormat ? labelFormat(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color || p.fill }} />
          {payload.length > 1 && <span className="text-ink-2">{p.name}</span>}
          <span className="font-semibold text-ink tabular ml-auto">{format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Single-series daily columns (e.g. bandwidth per day). */
export function DailyBars({ data, dataKey, format, height = 220 }: { data: any[]; dataKey: string; format: (v: number) => string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={tickStyle} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={format} tick={tickStyle} axisLine={false} tickLine={false} width={64} />
        <Tooltip cursor={{ fill: "rgba(29,29,31,0.04)" }} content={<ChartTooltip format={format} labelFormat={shortDate} />} />
        <Bar dataKey={dataKey} fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={24} name="Value" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-series level over time (e.g. storage). */
export function DailyArea({ data, dataKey, format, height = 220 }: { data: any[]; dataKey: string; format: (v: number) => string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={tickStyle} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={format} tick={tickStyle} axisLine={false} tickLine={false} width={64} />
        <Tooltip cursor={{ stroke: AXIS, strokeWidth: 1 }} content={<ChartTooltip format={format} labelFormat={shortDate} />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={SERIES.primary}
          strokeWidth={2}
          fill={SERIES.primary}
          fillOpacity={0.1}
          activeDot={{ r: 4.5, stroke: "#fff", strokeWidth: 2 }}
          name="Value"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Two series by month on one axis (revenue vs cost), with a legend. */
export function MonthlyPair({ data, a, b, format, height = 260 }: {
  data: any[]; a: { key: string; label: string }; b: { key: string; label: string }; format: (v: number) => string; height?: number;
}) {
  const monthLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return (
    <div>
      <Legend items={[{ color: SERIES.primary, label: a.label }, { color: SERIES.secondary, label: b.label }]} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={format} tick={tickStyle} axisLine={false} tickLine={false} width={64} />
          <Tooltip cursor={{ fill: "rgba(29,29,31,0.04)" }} content={<ChartTooltip format={format} labelFormat={(m: string) => new Date(m).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} />} />
          <Bar dataKey={a.key} name={a.label} fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey={b.key} name={b.label} fill={SERIES.secondary} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-4 mb-3">
      {items.map((i, n) => (
        <span key={n} className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <span className="size-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Horizontal usage meter against a quota. Status color + a label, never color alone. */
export function QuotaMeter({ label, used, limit, pct }: { label: string; used: string; limit: string; pct: number }) {
  const tone = pct >= 100 ? "bg-bad" : pct >= 80 ? "bg-warn" : "bg-ink";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-[12.5px] text-ink-3 tabular">
          <span className="text-ink font-semibold">{used}</span> of {limit}
          {pct >= 80 && <span className={pct >= 100 ? "text-bad" : "text-warn"}> · {pct >= 100 ? "over quota" : "nearly full"}</span>}
        </span>
      </div>
      <div className="mt-2.5 h-2 rounded-full bg-sunken overflow-hidden">
        <div className={`h-full rounded-full ${tone} transition-[width] duration-700`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
