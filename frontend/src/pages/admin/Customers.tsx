import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";

import { get, patch } from "../../lib/api";
import { bytes, date, taka } from "../../lib/format";
import type { Organization, Plan } from "../../lib/types";
import { Badge, Button, Card, Input, LoadingBlock, PageHeader, Select, useToast } from "../../components/ui";

interface Row {
  organization: Organization; members: number; videos: number; storage_bytes: number; bandwidth_bytes: number;
  revenue_paisa: number; cost_paisa: number; margin_paisa: number; storage_pct: number; bandwidth_pct: number; quota_alert: boolean;
}
const STATUS_TONE = { pending: "warn", trial: "clay", active: "ok", suspended: "bad" } as const;

export default function AdminCustomers() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const rows = useQuery({ queryKey: ["admin-customers"], queryFn: () => get<{ results: Row[] }>("/admin-api/customers").then((d) => d.results) });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => get<{ results: Plan[] }>("/admin-api/plans").then((d) => d.results) });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => patch(`/admin-api/customers/${id}`, body),
    onSuccess: () => { toast("Updated"); qc.invalidateQueries({ queryKey: ["admin-customers"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); },
    onError: (e: Error) => toast(e.message, "bad"),
  });

  if (rows.isLoading) return <LoadingBlock />;
  const list = (rows.data ?? []).filter((r) => r.organization.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="Customers" description="Revenue and cost are this month's estimates from live usage." actions={
        <div className="relative w-64"><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-3" /><Input className="pl-10" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      } />
      <Card className="overflow-x-auto">
        <table className="w-full text-[13.5px] min-w-[1000px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-3 border-b border-line">
              {["Organization", "Status", "Plan", "Storage", "Streamed", "Revenue", "Cost", "Margin", ""].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((r) => {
              const o = r.organization;
              return (
                <tr key={o.id} className="hover:bg-sunken/30">
                  <td className="px-5 py-3.5">
                    <div className="font-medium flex items-center gap-1.5">{o.name}{r.quota_alert && <AlertTriangle className="size-3.5 text-warn" aria-label="Above 80% of quota" />}</div>
                    <div className="text-[12px] text-ink-3">{r.members} members · {r.videos} videos · since {date(o.created_at)}</div>
                  </td>
                  <td className="px-5 py-3.5"><Badge tone={STATUS_TONE[o.status]} className="capitalize">{o.status}</Badge></td>
                  <td className="px-5 py-3.5">
                    <Select className="!h-8 w-32 text-[13px]" value={o.plan?.id ?? ""} onChange={(e) => update.mutate({ id: o.id, body: { plan: e.target.value ? Number(e.target.value) : null } })}>
                      <option value="">No plan</option>
                      {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </td>
                  <td className="px-5 py-3.5 tabular">{bytes(r.storage_bytes)}<div className="text-[11.5px] text-ink-3">{r.storage_pct}% of quota</div></td>
                  <td className="px-5 py-3.5 tabular">{bytes(r.bandwidth_bytes)}<div className="text-[11.5px] text-ink-3">{r.bandwidth_pct}% of quota</div></td>
                  <td className="px-5 py-3.5 tabular">{taka(r.revenue_paisa)}</td>
                  <td className="px-5 py-3.5 tabular text-ink-3">{taka(r.cost_paisa)}</td>
                  <td className="px-5 py-3.5 tabular font-medium">{taka(r.margin_paisa)}</td>
                  <td className="px-5 py-3.5 text-right whitespace-nowrap">
                    {o.status === "pending" && <Button size="sm" onClick={() => update.mutate({ id: o.id, body: { status: "trial" } })}>Approve trial</Button>}
                    {(o.status === "trial" || o.status === "pending") && o.plan && <Button size="sm" variant="secondary" className="ml-2" onClick={() => update.mutate({ id: o.id, body: { status: "active" } })}>Activate</Button>}
                    {o.status !== "suspended" && o.status !== "pending" && <Button size="sm" variant="ghost" className="ml-1 !text-bad" onClick={() => update.mutate({ id: o.id, body: { status: "suspended" } })}>Suspend</Button>}
                    {o.status === "suspended" && <Button size="sm" variant="secondary" onClick={() => update.mutate({ id: o.id, body: { status: o.plan ? "active" : "trial" } })}>Reactivate</Button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <p className="text-center text-[13.5px] text-ink-3 py-10">No customers yet.</p>}
      </Card>
    </div>
  );
}
