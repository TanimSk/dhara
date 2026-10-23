import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";

import { get } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { date, month, taka } from "../../lib/format";
import type { Invoice } from "../../lib/types";
import { Badge, Button, LoadingBlock, Logo } from "../../components/ui";

export function InvoiceDocument({ invoice, orgName }: { invoice: Invoice; orgName: string }) {
  const plan = invoice.plan_snapshot;
  return (
    <div className="bg-surface border border-line rounded-3xl shadow-card p-8 sm:p-12 print:border-0 print:shadow-none print:p-0">
      <div className="flex items-start justify-between gap-6">
        <div>
          <Logo />
          <p className="mt-3 text-[12.5px] text-ink-3">Video hosting · Dhaka, Bangladesh</p>
        </div>
        <div className="text-right">
          <div className="text-[22px] font-semibold tracking-[-0.02em]">Invoice</div>
          <div className="text-[13px] text-ink-3 font-mono mt-1">{invoice.number}</div>
          <Badge tone={invoice.status === "paid" ? "ok" : "warn"} className="mt-2 capitalize">{invoice.status}</Badge>
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-6 text-[13.5px]">
        <div><div className="text-ink-3 text-[12px] mb-1">Billed to</div><div className="font-medium">{orgName}</div></div>
        <div className="text-right"><div className="text-ink-3 text-[12px] mb-1">Period</div><div className="font-medium">{month(invoice.period)}</div></div>
      </div>
      <table className="mt-10 w-full text-[13.5px]">
        <thead><tr className="text-ink-3 text-[12px] text-left border-b border-line"><th className="pb-2 font-medium">Description</th><th className="pb-2 font-medium text-right">Amount</th></tr></thead>
        <tbody className="divide-y divide-line">
          <tr><td className="py-3">{plan.name} plan - {plan.storage_gb} GB storage, {((plan.bandwidth_gb ?? 0) / 1024).toFixed(0)} TB streaming</td><td className="py-3 text-right tabular">{taka(invoice.base_paisa)}</td></tr>
          <tr><td className="py-3">Overage - {invoice.storage_gb_avg} GB avg stored, {invoice.bandwidth_tb} TB streamed</td><td className="py-3 text-right tabular">{taka(invoice.overage_paisa)}</td></tr>
          {invoice.adjustment_paisa !== 0 && <tr><td className="py-3">Adjustment</td><td className="py-3 text-right tabular">{taka(invoice.adjustment_paisa)}</td></tr>}
        </tbody>
        <tfoot><tr className="border-t-2 border-ink"><td className="pt-4 font-semibold">Total</td><td className="pt-4 text-right text-[20px] font-semibold tabular">{taka(invoice.total_paisa)}</td></tr></tfoot>
      </table>
      <div className="mt-10 text-[12.5px] text-ink-3 leading-relaxed">
        {invoice.status === "paid" ? <>Paid on {date(invoice.paid_at)}{invoice.note ? ` · Ref ${invoice.note}` : ""}. Thank you.</> : <>Pay by bKash or bank transfer and use <span className="font-mono text-ink-2">{invoice.number}</span> as the reference.</>}
      </div>
    </div>
  );
}

export default function InvoicePage() {
  const { id } = useParams();
  const { membership } = useAuth();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => get<{ invoice: Invoice }>(`/invoices/${id}`).then((d) => d.invoice) });
  if (q.isLoading || !q.data) return <LoadingBlock />;
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5 print:hidden">
        <Link to="/app/billing" className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Billing</Link>
        <Button variant="secondary" size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>Print or save PDF</Button>
      </div>
      <InvoiceDocument invoice={q.data} orgName={membership!.organization.name} />
    </div>
  );
}
