import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { get, patch } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { dateTime } from "../../lib/format";
import type { Organization } from "../../lib/types";
import { Button, Card, CardHeader, Field, Input, LoadingBlock, PageHeader, useToast } from "../../components/ui";

interface Log { id: number; user: string | null; action: string; target: string; created_at: string }

const ACTIONS: Record<string, string> = {
  "organization.created": "created the organization",
  "organization.updated": "updated organization settings",
  "library.created": "created library",
  "library.updated": "updated library",
  "library.deleted": "deleted library",
  "library.key_rotated": "rotated the security key of",
  "video.deleted": "deleted video",
  "video.bulk_deleted": "deleted",
  "api_key.created": "created API key",
  "api_key.revoked": "revoked API key",
  "member.invited": "invited",
  "member.joined": "joined:",
  "member.removed": "removed",
  "member.role_changed": "changed the role of",
  "admin.organization_updated": "(dhara staff) updated",
};

export default function OrgSettings() {
  const { membership, reload } = useAuth();
  const toast = useToast();
  const org = membership!.organization;
  const [name, setName] = useState(org.name);
  const [email, setEmail] = useState(org.billing_email);
  useEffect(() => { setName(org.name); setEmail(org.billing_email); }, [org.id]); // eslint-disable-line

  const save = useMutation({
    mutationFn: () => patch<{ organization: Organization }>("/organizations/current", { name, billing_email: email }),
    onSuccess: () => { toast("Saved"); reload(); },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  const logs = useQuery({ queryKey: ["audit-log"], queryFn: () => get<{ results: Log[] }>("/audit-log").then((d) => d.results) });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" />
      <Card className="mb-6">
        <CardHeader title="Organization" />
        <form className="px-6 pb-6 grid gap-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Billing email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Button type="submit" loading={save.isPending}>Save changes</Button></div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Activity" description="Key rotations, deletions and team changes." />
        {logs.isLoading ? <LoadingBlock /> : (
          <div className="divide-y divide-line border-t border-line">
            {logs.data?.map((l) => (
              <div key={l.id} className="px-6 py-3 flex items-baseline justify-between gap-4 text-[13.5px]">
                <span className="min-w-0"><span className="font-medium">{l.user ?? "API key"}</span> <span className="text-ink-2">{ACTIONS[l.action] ?? l.action}</span> <span className="font-medium">{l.target}</span></span>
                <span className="text-[12px] text-ink-3 whitespace-nowrap">{dateTime(l.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
