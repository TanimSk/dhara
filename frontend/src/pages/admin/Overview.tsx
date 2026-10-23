import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { get } from "../../lib/api";
import { bytes, month, taka } from "../../lib/format";
import { MonthlyPair } from "../../components/Charts";
import { Card, CardHeader, LoadingBlock, PageHeader, ProgressBar, Stat } from "../../components/ui";

interface Finances { month: string; revenue_paisa: number; revenue_source: string; collected_paisa: number; cost_paisa: number; profit_paisa: number }
interface OverviewData {
  finances: Finances; target_paisa: number; storage_bytes: number;
  organizations: Record<"total" | "active" | "trial" | "pending" | "suspended", number>;
  jobs: Record<"queued" | "running" | "failed", number>;
}

export default function AdminOverview() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => get<OverviewData>("/admin-api/overview") });
  const profit = useQuery({ queryKey: ["admin-profit"], queryFn: () => get<{ results: Finances[] }>("/admin-api/profit").then((d) => d.results) });
  if (q.isLoading) return <LoadingBlock />;
  const d = q.data!;
  const f = d.finances;
  const progress = d.target_paisa ? (f.profit_paisa / d.target_paisa) * 100 : 0;

  return (
    <div>
      <PageHeader title="Overview" description={`${month(f.month)} · revenue is ${f.revenue_source === "estimate" ? "estimated from live usage" : "from invoices"}.`} />
      <Card className="p-7 mb-6">
        <div className="flex flex-col md:flex-row md:items-end gap-6 justify-between">
          <div>
            <div className="text-[13px] font-medium text-ink-3">Profit this month</div>
            <div className="mt-2 text-[48px] font-semibold tracking-[-0.045em] tabular leading-none">{taka(f.profit_paisa)}</div>
            <div className="mt-2 text-[13px] text-ink-3">Target {taka(d.target_paisa)} · {progress >= 100 ? "reached" : `${Math.max(0, Math.round(progress))}% of the way`}</div>
          </div>
          <div className="grid grid-cols-3 gap-8">
            <Stat label="Revenue" value={taka(f.revenue_paisa)} />
            <Stat label="Collected" value={taka(f.collected_paisa)} />
            <Stat label="Costs" value={taka(f.cost_paisa)} sub={f.cost_paisa === 0 ? <Link to="/admin/costs" className="text-clay hover:underline">Add this month's bills</Link> : undefined} />
          </div>
        </div>
        <ProgressBar className="mt-6 !h-2" value={progress} tone={progress >= 100 ? "ok" : "clay"} />
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-6"><Stat label="Paying customers" value={d.organizations.active} sub={`${d.organizations.total} ${d.organizations.total === 1 ? "organization" : "organizations"} total`} /></Card>
        <Card className="p-6"><Stat label="On trial" value={d.organizations.trial} sub={d.organizations.pending ? <Link to="/admin/customers" className="text-clay hover:underline">{d.organizations.pending} awaiting approval</Link> : "None waiting for approval"} /></Card>
        <Card className="p-6"><Stat label="Stored on R2" value={bytes(d.storage_bytes)} /></Card>
        <Card className="p-6"><Stat label="Encoder" value={`${d.jobs.running} running`} sub={<Link to="/admin/encoder" className={d.jobs.failed ? "text-bad hover:underline" : "hover:underline"}>{d.jobs.queued} queued · {d.jobs.failed} failed this week</Link>} /></Card>
      </div>
      <Card>
        <CardHeader title="Revenue and costs, last 12 months" />
        <div className="px-4 pb-5">{profit.data && profit.data.every((m) => !m.revenue_paisa && !m.cost_paisa) ? (
          <p className="text-[13.5px] text-ink-3 px-2 pb-6">No revenue or costs recorded yet. Activate a customer on a plan and add this month's bills to see the trend.</p>
        ) : profit.data ? <MonthlyPair data={profit.data} a={{ key: "revenue_paisa", label: "Revenue" }} b={{ key: "cost_paisa", label: "Platform costs" }} format={(v) => taka(v)} /> : <LoadingBlock />}</div>
      </Card>
    </div>
  );
}
