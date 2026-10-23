import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { get, patch, post } from "../../lib/api";
import { gbLabel, taka } from "../../lib/format";
import type { Plan } from "../../lib/types";
import { Badge, Button, Card, Field, Input, LoadingBlock, Modal, PageHeader, Toggle, useToast } from "../../components/ui";

type Form = { name: string; price: string; storage_gb: string; bandwidth_tb: string; max_members: string; over_gb: string; over_tb: string };
const empty: Form = { name: "", price: "", storage_gb: "", bandwidth_tb: "", max_members: "", over_gb: "6", over_tb: "250" };

export default function AdminPlans() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Plan | null | "new">(null);
  const [form, setForm] = useState<Form>(empty);
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => get<{ results: Plan[] }>("/admin-api/plans").then((d) => d.results) });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name, price_paisa: Math.round(Number(form.price) * 100), storage_gb: Number(form.storage_gb),
        bandwidth_gb: Math.round(Number(form.bandwidth_tb) * 1024), max_members: Number(form.max_members),
        overage_storage_paisa_per_gb: Math.round(Number(form.over_gb) * 100), overage_bandwidth_paisa_per_tb: Math.round(Number(form.over_tb) * 100),
      };
      return editing === "new" ? post("/admin-api/plans", body) : patch(`/admin-api/plans/${(editing as Plan).id}`, body);
    },
    onSuccess: () => { toast("Plan saved"); setEditing(null); qc.invalidateQueries({ queryKey: ["admin-plans"] }); },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  const toggle = useMutation({
    mutationFn: (p: Plan) => patch(`/admin-api/plans/${p.id}`, { active: !p.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-plans"] }),
  });

  function open(p: Plan | "new") {
    setEditing(p);
    setForm(p === "new" ? empty : {
      name: p.name, price: String(p.price_paisa / 100), storage_gb: String(p.storage_gb), bandwidth_tb: String(p.bandwidth_gb / 1024),
      max_members: String(p.max_members), over_gb: String(p.overage_storage_paisa_per_gb / 100), over_tb: String(p.overage_bandwidth_paisa_per_tb / 100),
    });
  }
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (plans.isLoading) return <LoadingBlock />;
  return (
    <div>
      <PageHeader title="Plans" description="Changes apply to future invoices. Past invoices keep the plan they were issued with." actions={<Button icon={<Plus className="size-4" />} onClick={() => open("new")}>New plan</Button>} />
      <div className="grid gap-4 md:grid-cols-3">
        {plans.data?.map((p) => (
          <Card key={p.id} className="p-6">
            <div className="flex items-center justify-between"><h3 className="text-[16px] font-semibold">{p.name}</h3>{p.active ? <Badge tone="ok">Active</Badge> : <Badge>Hidden</Badge>}</div>
            <div className="mt-3 text-[28px] font-semibold tracking-[-0.03em] tabular">{taka(p.price_paisa)}<span className="text-[13px] text-ink-3 font-normal"> / mo</span></div>
            <dl className="mt-4 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-3">Storage</dt><dd>{gbLabel(p.storage_gb)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Streaming</dt><dd>{gbLabel(p.bandwidth_gb)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Members</dt><dd>{p.max_members}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Overage</dt><dd>{taka(p.overage_storage_paisa_per_gb)}/GB · {taka(p.overage_bandwidth_paisa_per_tb)}/TB</dd></div>
            </dl>
            <div className="mt-5 flex items-center justify-between">
              <Button variant="secondary" size="sm" onClick={() => open(p)}>Edit</Button>
              <span className="flex items-center gap-2 text-[12.5px] text-ink-3">Visible <Toggle checked={p.active} onChange={() => toggle.mutate(p)} label="Visible" /></span>
            </div>
          </Card>
        ))}
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New plan" : "Edit plan"}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Save plan</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input value={form.name} onChange={set("name")} /></Field>
          <Field label="Price (৳ / month)"><Input type="number" value={form.price} onChange={set("price")} /></Field>
          <Field label="Team members"><Input type="number" value={form.max_members} onChange={set("max_members")} /></Field>
          <Field label="Storage (GB)"><Input type="number" value={form.storage_gb} onChange={set("storage_gb")} /></Field>
          <Field label="Streaming (TB / month)"><Input type="number" step="0.5" value={form.bandwidth_tb} onChange={set("bandwidth_tb")} /></Field>
          <Field label="Storage overage (৳ / GB-month)"><Input type="number" value={form.over_gb} onChange={set("over_gb")} /></Field>
          <Field label="Streaming overage (৳ / TB)"><Input type="number" value={form.over_tb} onChange={set("over_tb")} /></Field>
        </div>
      </Modal>
    </div>
  );
}
