import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { get } from "../../lib/api";
import { useRole } from "../../lib/auth";
import { bytes, gbLabel, taka } from "../../lib/format";
import type { TopVideo, UsageDay, UsageSummary } from "../../lib/types";
import { DailyArea, DailyBars, QuotaMeter } from "../../components/Charts";
import { Card, CardHeader, EmptyState, LoadingBlock, PageHeader, Stat, Tabs } from "../../components/ui";

const GB = 1024 ** 3;

export default function Usage() {
  const { isOwner } = useRole();
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const summary = useQuery({ queryKey: ["usage-summary"], queryFn: () => get<UsageSummary>("/usage/summary") });
  const from = new Date(Date.now() - (Number(days) - 1) * 86400000).toISOString().slice(0, 10);
  const series = useQuery({ queryKey: ["usage-days", days], queryFn: () => get<{ results: UsageDay[] }>(`/usage?group=day&from=${from}`).then((d) => d.results) });
  const top = useQuery({ queryKey: ["usage-top", days], queryFn: () => get<{ results: TopVideo[] }>(`/usage?group=video&from=${from}&limit=10`).then((d) => d.results) });

  if (summary.isLoading) return <LoadingBlock />;
  const s = summary.data!;
  const maxTop = Math.max(1, ...(top.data ?? []).map((t) => t.bytes_delivered));

  return (
    <div>
      <PageHeader title="Usage" description="Bandwidth is measured at the edge on every request; storage is the total size of your encoded videos." actions={<Tabs value={days} onChange={setDays} tabs={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-6"><Stat label="Stored now" value={bytes(s.storage_now_bytes)} sub={`of ${gbLabel(s.quotas.storage_gb)}`} /></Card>
        <Card className="p-6"><Stat label="Streamed this month" value={bytes(s.bandwidth_bytes)} sub={`of ${gbLabel(s.quotas.bandwidth_gb)}`} /></Card>
        <Card className="p-6"><Stat label="Requests this month" value={s.requests.toLocaleString("en-IN")} sub={s.cache_hit_ratio != null ? `${Math.round(s.cache_hit_ratio * 100)}% served from edge cache` : "No traffic yet"} /></Card>
        {isOwner && s.estimate ? (
          <Card className="p-6"><Stat label="Estimated bill" value={taka(s.estimate.total_paisa)} sub={s.estimate.plan ? <Link to="/app/billing" className="text-clay hover:underline">{s.estimate.plan.name} plan · details</Link> : "Trial - nothing to pay"} /></Card>
        ) : (
          <Card className="p-6"><Stat label="Plan" value={s.quotas.storage_gb === 20 ? "Trial" : "Active"} sub="Owners see billing" /></Card>
        )}
      </div>

      <Card className="p-6 mb-6 grid gap-6 sm:grid-cols-2">
        <QuotaMeter label="Storage" used={bytes(s.storage_now_bytes)} limit={gbLabel(s.quotas.storage_gb)} pct={s.storage_pct} />
        <QuotaMeter label="Streaming this month" used={bytes(s.bandwidth_bytes)} limit={gbLabel(s.quotas.bandwidth_gb)} pct={s.bandwidth_pct} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader title="Bandwidth per day" description={series.data ? `${bytes(series.data.reduce((a, d) => a + d.bytes_delivered, 0))} in ${days} days` : undefined} />
          <div className="px-4 pb-5">{series.data ? <DailyBars data={series.data} dataKey="bytes_delivered" format={(v) => bytes(v, 0)} /> : <LoadingBlock />}</div>
        </Card>
        <Card>
          <CardHeader title="Storage" description="End-of-day total" />
          <div className="px-4 pb-5">{series.data ? <DailyArea data={series.data} dataKey="storage_bytes" format={(v) => (v >= GB ? `${(v / GB).toFixed(v >= 10 * GB ? 0 : 1)} GB` : bytes(v, 0))} /> : <LoadingBlock />}</div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Top videos by bandwidth" />
        <div className="px-6 pb-4">
          {top.data && top.data.length === 0 && <EmptyState title="No views yet" description="Once students start watching, your most-streamed videos appear here." />}
          <div className="divide-y divide-line">
            {top.data?.map((t, i) => (
              <Link key={t.video_id} to={`/app/videos/${t.video_id}`} className="flex items-center gap-4 py-3 group">
                <span className="w-5 text-[13px] text-ink-3 tabular">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium truncate group-hover:text-clay">{t.title}</div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-sunken overflow-hidden"><div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(t.bytes_delivered / maxTop) * 100}%` }} /></div>
                </div>
                <span className="text-[13px] font-semibold tabular w-20 text-right">{bytes(t.bytes_delivered)}</span>
              </Link>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
