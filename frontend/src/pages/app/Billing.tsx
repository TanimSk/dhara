import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, FileText } from "lucide-react";

import { get } from "../../lib/api";
import { bytes, date, gbLabel, month, taka } from "../../lib/format";
import type { Estimate, Invoice, Organization, Plan } from "../../lib/types";
import { Badge, Card, CardHeader, EmptyState, LoadingBlock, PageHeader, cx } from "../../components/ui";

const STATUS_TONE = { draft: "neutral", sent: "warn", paid: "ok" } as const;

export default function Billing() {
  const current = useQuery({ queryKey: ["billing"], queryFn: () => get<{ organization: Organization; estimate: Estimate; plans: Plan[] }>("/billing/current") });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => get<{ results: Invoice[] }>("/invoices").then((d) => d.results) });
  if (current.isLoading) return <LoadingBlock />;
  const { organization: org, estimate: est, plans } = current.data!;
  const billed = !!est.plan;

  return (
    <div>
      <PageHeader title="Billing" description="Invoices are issued in taka at the start of each month. Pay by bKash or bank transfer." />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] mb-6">
        <Card className="p-7">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-3">This month so far · {month(est.period)}</span>
            {billed ? <Badge tone="ok">{est.plan!.name}</Badge> : <Badge tone="clay">{org.status === "trial" ? "Trial" : "No plan"}</Badge>}
          </div>
          <div className="mt-3 text-[44px] font-semibold tracking-[-0.04em] tabular">{taka(est.total_paisa)}</div>
          {billed ? (
            <dl className="mt-6 space-y-2.5 text-[13.5px]">
              <div className="flex justify-between"><dt className="text-ink-3">{est.plan!.name} plan</dt><dd className="tabular">{taka(est.base_paisa)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Storage overage ({est.storage_overage_gb} GB)</dt><dd className="tabular">{taka(Math.round(est.storage_overage_gb * est.plan!.overage_storage_paisa_per_gb))}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Streaming overage ({est.bandwidth_overage_tb} TB)</dt><dd className="tabular">{taka(Math.round(est.bandwidth_overage_tb * est.plan!.overage_bandwidth_paisa_per_tb))}</dd></div>
              <div className="flex justify-between pt-2.5 border-t border-line text-ink-3"><dt>Average storage · streaming</dt><dd className="tabular">{bytes(est.storage_avg_bytes)} · {bytes(est.bandwidth_bytes)}</dd></div>
            </dl>
          ) : (
            <p className="mt-4 text-[14px] text-ink-3 leading-relaxed">
              {org.status === "trial" ? `Your free trial runs until ${date(org.trial_ends_at)}. ` : ""}
              To choose a plan, message us - we'll switch you over and send the first invoice in taka.
            </p>
          )}
        </Card>
        <Card className="p-7">
          <h3 className="text-[15px] font-semibold">How to pay</h3>
          <ol className="mt-4 space-y-3 text-[13.5px] text-ink-2 leading-relaxed list-decimal pl-4">
            <li>Open the invoice when it arrives at the start of the month.</li>
            <li>Send the total by bKash or bank transfer, with the invoice number as the reference.</li>
            <li>We confirm the payment and mark the invoice paid, usually the same day.</li>
          </ol>
          <p className="mt-4 text-[12.5px] text-ink-3">Prepay a year and get two months free.</p>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title="Plans" description="Every plan includes private playback, domain lock, the full quality ladder and the API." />
        <div className="grid gap-3 px-6 pb-6 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = est.plan?.id === p.id;
            return (
              <div key={p.id} className={cx("rounded-2xl border p-5", isCurrent ? "border-ink bg-sunken/40" : "border-line")}>
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold">{p.name}</span>
                  {isCurrent && <Badge tone="ok">Current</Badge>}
                </div>
                <div className="mt-2 text-[24px] font-semibold tracking-[-0.03em] tabular">{taka(p.price_paisa)}<span className="text-[13px] font-normal text-ink-3"> / month</span></div>
                <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
                  {[`${gbLabel(p.storage_gb)} storage`, `${gbLabel(p.bandwidth_gb)} streaming`, `${p.max_members} team members`].map((x) => (
                    <li key={x} className="flex items-center gap-2"><Check className="size-3.5 text-clay" />{x}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Invoices" />
        {invoices.data?.length === 0 ? (
          <EmptyState icon={<FileText className="size-6" />} title="No invoices yet" description="Your first invoice arrives at the start of the month after your plan begins." />
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {invoices.data?.map((i) => (
              <Link key={i.id} to={`/app/billing/invoices/${i.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-sunken/40">
                <FileText className="size-4 text-ink-3" />
                <div className="flex-1">
                  <div className="text-[14px] font-medium">{month(i.period)}</div>
                  <div className="text-[12.5px] text-ink-3 font-mono">{i.number}</div>
                </div>
                <Badge tone={STATUS_TONE[i.status]} className="capitalize">{i.status}</Badge>
                <span className="w-24 text-right text-[14px] font-semibold tabular">{taka(i.total_paisa)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
