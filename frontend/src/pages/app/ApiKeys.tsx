import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus } from "lucide-react";

import { del, get, post } from "../../lib/api";
import { date, relative } from "../../lib/format";
import type { ApiKey } from "../../lib/types";
import { Button, Card, CardHeader, CodeBlock, ConfirmModal, CopyField, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, useToast } from "../../components/ui";

export default function ApiKeys() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => get<{ results: ApiKey[] }>("/api-keys").then((d) => d.results) });

  const create = useMutation({
    mutationFn: () => post<{ key: string }>("/api-keys", { name }),
    onSuccess: (d) => { setCreated(d.key); setName(""); qc.invalidateQueries({ queryKey: ["api-keys"] }); },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => del(`/api-keys/${id}`),
    onSuccess: () => { toast("Key revoked"); setRevoking(null); qc.invalidateQueries({ queryKey: ["api-keys"] }); },
  });

  const origin = window.location.origin;
  const example = `# Create a video, then upload the file with any tus client
curl -X POST ${origin}/api/v1/libraries/LIBRARY_ID/videos \\
  -H "Authorization: Bearer $DHARA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Chapter 1 - Motion", "filename": "chapter1.mp4"}'`;

  return (
    <div>
      <PageHeader
        title="API keys"
        description="Keys let your servers manage libraries and videos. They can't change your team, billing or keys."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => { setCreated(null); setOpen(true); }}>New key</Button>}
      />
      <Card className="mb-6">
        {keys.isLoading ? <LoadingBlock /> : keys.data?.length === 0 ? (
          <EmptyState icon={<KeyRound className="size-6" />} title="No API keys" description="Create one to upload and manage videos from your own platform." />
        ) : (
          <div className="divide-y divide-line">
            {keys.data?.map((k) => (
              <div key={k.id} className="flex items-center gap-4 px-6 py-4">
                <span className="size-9 rounded-xl bg-sunken flex items-center justify-center text-ink-3"><KeyRound className="size-4" /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium">{k.name}</div>
                  <div className="text-[12.5px] text-ink-3"><code className="font-mono">dh_{k.prefix}_••••</code> · created {date(k.created_at)}{k.created_by ? ` by ${k.created_by}` : ""} · last used {relative(k.last_used_at)}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setRevoking(k)}>Revoke</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <CardHeader title="Quick start" description={<>Send <code className="font-mono">Authorization: Bearer &lt;key&gt;</code> with each request. Full reference at <a className="text-clay hover:underline" href="/api/docs/" target="_blank">API docs</a>.</>} />
        <div className="px-6 pb-6"><CodeBlock language="Shell" code={example} /></div>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={created ? "Copy your new key" : "New API key"}
        description={created ? "This is the only time it's shown. Store it in your server's environment." : "Name it after where it'll be used."}
        footer={created ? <Button onClick={() => setOpen(false)}>Done</Button> : <><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>Create key</Button></>}
      >
        {created ? <CopyField value={created} /> : (
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
            <Field label="Name"><Input autoFocus placeholder="e.g. Course website" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          </form>
        )}
      </Modal>
      <ConfirmModal open={!!revoking} onClose={() => setRevoking(null)} onConfirm={() => revoking && revoke.mutate(revoking.id)} loading={revoke.isPending} confirmLabel="Revoke" title={`Revoke "${revoking?.name}"?`} description="Anything using this key stops working immediately." />
    </div>
  );
}
