import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { del, get, post } from "../../lib/api";
import { month, taka } from "../../lib/format";
import { Button, Card, CardHeader, Field, Input, LoadingBlock, PageHeader, Select, useToast } from "../../components/ui";

interface Cost { id: number; month: string; item: string; description: string; usd: string; bdt_paisa: number }
const ITEMS: Record<string, string> = { droplet: "Droplet", workers: "Cloudflare Workers", r2_storage: "R2 storage", r2_ops: "R2 operations", other: "Other" };

export default function AdminCosts() {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ month: new Date().toISOString().slice(0, 7), item: "droplet", description: "", usd: "", bdt: "" });
  const costs = useQuery({ queryKey: ["admin-costs"], queryFn: () => get<{ results: Cost[] }>("/admin-api/costs").then((d) => d.results) });
  const add = useMutation({
    mutationFn: () => post("/admin-api/costs", {
      month: form.month + "-01", item: form.item, description: form.description, usd: form.usd || "0",
      ...(form.bdt ? { bdt_paisa: Math.round(Number(form.bdt) * 100) } : {}),
    }),
    onSuccess: () => { toast("Cost added"); setForm((f) => ({ ...f, description: "", usd: "", bdt: "" })); qc.invalidateQueries({ queryKey: ["admin-costs"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  const remove = useMutation({ mutationFn: (id: number) => del(`/admin-api/costs/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-costs"] }) });

  const byMonth = (costs.data ?? []).reduce<Record<string, Cost[]>>((acc, c) => ((acc[c.month] ??= []).push(c), acc), {});

  return (
    <div className="max-w-4xl">
      <PageHeader title="Platform costs" description="Enter your real monthly bills. The profit page compares them with revenue." />
      <Card className="mb-6">
        <CardHeader title="Add a bill" description="Enter USD and we convert at the configured rate, or enter the exact taka amount from your card statement." />
        <form className="px-6 pb-6 grid gap-4 sm:grid-cols-6 items-end" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <Field label="Month" className="sm:col-span-2"><Input type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></Field>
          <Field label="Item" className="sm:col-span-2"><Select value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })}>{Object.entries(ITEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="USD"><Input type="number" step="0.01" value={form.usd} onChange={(e) => setForm({ ...form, usd: e.target.value })} /></Field>
          <Field label="৳ (optional)"><Input type="number" value={form.bdt} onChange={(e) => setForm({ ...form, bdt: e.target.value })} /></Field>
          <Field label="Note" className="sm:col-span-4"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Invoice #1234" /></Field>
          <Button type="submit" className="sm:col-span-2" loading={add.isPending} disabled={!form.usd && !form.bdt}>Add cost</Button>
        </form>
      </Card>
      {costs.isLoading ? <LoadingBlock /> : Object.entries(byMonth).map(([m, items]) => (
        <Card key={m} className="mb-4">
          <CardHeader title={month(m)} action={<span className="text-[14px] font-semibold tabular">{taka(items.reduce((a, c) => a + c.bdt_paisa, 0))}</span>} />
          <div className="divide-y divide-line border-t border-line">
            {items.map((c) => (
              <div key={c.id} className="flex items-center gap-4 px-6 py-3 text-[13.5px]">
                <span className="flex-1">{ITEMS[c.item]}{c.description && <span className="text-ink-3"> · {c.description}</span>}</span>
                <span className="text-ink-3 tabular">${c.usd}</span>
                <span className="w-24 text-right tabular font-medium">{taka(c.bdt_paisa)}</span>
                <button onClick={() => remove.mutate(c.id)} className="size-7 rounded-full flex items-center justify-center text-ink-3 hover:bg-sunken hover:text-bad" aria-label="Delete"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
