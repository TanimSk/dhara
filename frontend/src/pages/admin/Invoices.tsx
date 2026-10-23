import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { get, patch, post } from "../../lib/api";
import { month, taka } from "../../lib/format";
import type { Invoice } from "../../lib/types";
import { InvoiceDocument } from "../app/Invoice";
import { Badge, Button, Card, Field, Input, LoadingBlock, Modal, PageHeader, Select, useToast } from "../../components/ui";

const TONE = { draft: "neutral", sent: "warn", paid: "ok" } as const;

function lastMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export default function AdminInvoices() {
  const qc = useQueryClient();
  const toast = useToast();
  const [period, setPeriod] = useState(lastMonth());
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Invoice | null>(null);
  const [note, setNote] = useState("");
  const [adjust, setAdjust] = useState("0");

  const list = useQuery({
    queryKey: ["admin-invoices", status],
    queryFn: () => get<{ results: Invoice[] }>(`/admin-api/invoices${status ? `?status=${status}` : ""}`).then((d) => d.results),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-invoices"] });
  const generate = useMutation({
    mutationFn: () => post<{ results: Invoice[] }>("/admin-api/invoices", { month: period }),
    onSuccess: (d) => { toast(`${d.results.length} invoices for ${month(period + "-01")}`); refresh(); },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  const update = useMutation({
    mutationFn: (body: Partial<Invoice>) => patch<{ invoice: Invoice }>(`/admin-api/invoices/${open!.id}`, body),
    onSuccess: (d) => { setOpen(d.invoice); toast("Invoice updated"); refresh(); },
    onError: (e: Error) => toast(e.message, "bad"),
  });

  function show(i: Invoice) {
    setOpen(i);
    setNote(i.note);
    setAdjust(String(i.adjustment_paisa / 100));
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Generate drafts on the 1st (the scheduled job does it too), review, send, and mark paid when the money arrives."
        actions={
          <>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-44" />
            <Button onClick={() => generate.mutate()} loading={generate.isPending}>Generate drafts</Button>
          </>
        }
      />
      <div className="mb-4 w-44">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option>
        </Select>
      </div>
      <Card>
        {list.isLoading ? <LoadingBlock /> : list.data?.length === 0 ? <p className="text-center text-[13.5px] text-ink-3 py-12">No invoices yet. Only organizations on a paid plan get invoices.</p> : (
          <div className="divide-y divide-line">
            {list.data?.map((i) => (
              <button key={i.id} onClick={() => show(i)} className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-sunken/40">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium">{i.organization_name}</div>
                  <div className="text-[12.5px] text-ink-3"><span className="font-mono">{i.number}</span> · {month(i.period)}{i.note ? ` · ${i.note}` : ""}</div>
                </div>
                <Badge tone={TONE[i.status]} className="capitalize">{i.status}</Badge>
                <span className="w-28 text-right font-semibold tabular">{taka(i.total_paisa)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.organization_name} - ${month(open.period)}` : ""} width="max-w-3xl">
        {open && (
          <div className="space-y-6">
            <InvoiceDocument invoice={open} orgName={open.organization_name} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment reference" hint="e.g. bKash TrxID"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              <Field label="Adjustment (৳)" hint="Negative for a discount."><Input type="number" value={adjust} onChange={(e) => setAdjust(e.target.value)} disabled={open.status === "paid"} /></Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => update.mutate({ note, adjustment_paisa: Math.round(Number(adjust) * 100) })}>Save</Button>
              {open.status === "draft" && <Button variant="secondary" onClick={() => update.mutate({ status: "sent", note, adjustment_paisa: Math.round(Number(adjust) * 100) })}>Mark sent</Button>}
              {open.status !== "paid" ? (
                <Button onClick={() => update.mutate({ status: "paid", note })} loading={update.isPending}>Mark paid</Button>
              ) : (
                <Button variant="ghost" onClick={() => update.mutate({ status: "sent" })}>Mark unpaid</Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
