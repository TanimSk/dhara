import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, UserPlus } from "lucide-react";

import { del, get, patch, post } from "../../lib/api";
import { useAuth, useRole } from "../../lib/auth";
import { date } from "../../lib/format";
import type { Invitation, Member, Role } from "../../lib/types";
import { Avatar, Badge, Button, Card, CardHeader, ConfirmModal, Field, Input, LoadingBlock, Modal, PageHeader, Select, useToast } from "../../components/ui";

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including billing and the team",
  admin: "Everything except billing and the team",
  uploader: "Upload and edit videos only",
};

export default function Team() {
  const { me, membership } = useAuth();
  const { isOwner } = useRole();
  const qc = useQueryClient();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("uploader");
  const [removing, setRemoving] = useState<Member | null>(null);

  const members = useQuery({ queryKey: ["members"], queryFn: () => get<{ results: Member[] }>("/members").then((d) => d.results) });
  const invites = useQuery({ queryKey: ["invitations"], queryFn: () => get<{ results: Invitation[] }>("/invitations").then((d) => d.results), enabled: isOwner });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["members"] }); qc.invalidateQueries({ queryKey: ["invitations"] }); };
  const onError = (e: Error) => toast(e.message, "bad");

  const invite = useMutation({
    mutationFn: () => post("/invitations", { email, role }),
    onSuccess: () => { toast(`Invitation sent to ${email}`); setInviteOpen(false); setEmail(""); refresh(); },
    onError,
  });
  const changeRole = useMutation({ mutationFn: ({ id, role }: { id: number; role: Role }) => patch(`/members/${id}`, { role }), onSuccess: () => { toast("Role updated"); refresh(); }, onError });
  const remove = useMutation({ mutationFn: (id: number) => del(`/members/${id}`), onSuccess: () => { toast("Member removed"); setRemoving(null); refresh(); }, onError });
  const revoke = useMutation({ mutationFn: (id: number) => del(`/invitations/${id}`), onSuccess: () => { toast("Invitation revoked"); refresh(); }, onError });

  if (members.isLoading) return <LoadingBlock />;
  const seats = membership!.organization.quotas.max_members;
  const used = (members.data?.length ?? 0) + (invites.data?.length ?? 0);

  return (
    <div>
      <PageHeader
        title="Team"
        description={`${used} of ${seats} seats used on your plan.`}
        actions={isOwner && <Button icon={<UserPlus className="size-4" />} onClick={() => setInviteOpen(true)} disabled={used >= seats}>Invite member</Button>}
      />
      <Card className="mb-6">
        <div className="divide-y divide-line">
          {members.data?.map((m) => (
            <div key={m.id} className="flex items-center gap-4 px-6 py-4">
              <Avatar name={m.name || m.email} src={m.avatar_url} size={38} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium truncate">{m.name || m.email} {m.email === me?.user.email && <span className="text-ink-3 font-normal">(you)</span>}</div>
                <div className="text-[12.5px] text-ink-3 truncate">{m.email} · joined {date(m.created_at)}</div>
              </div>
              {isOwner ? (
                <Select value={m.role} onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as Role })} className="w-32 !h-9">
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="uploader">Uploader</option>
                </Select>
              ) : (
                <Badge className="capitalize">{m.role}</Badge>
              )}
              {isOwner && m.email !== me?.user.email && (
                <Button variant="ghost" size="sm" onClick={() => setRemoving(m)}>Remove</Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {isOwner && invites.data && invites.data.length > 0 && (
        <Card>
          <CardHeader title="Pending invitations" />
          <div className="divide-y divide-line border-t border-line">
            {invites.data.map((i) => (
              <div key={i.id} className="flex items-center gap-4 px-6 py-3.5">
                <span className="size-9 rounded-full bg-sunken flex items-center justify-center text-ink-3"><Mail className="size-4" /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium truncate">{i.email}</div>
                  <div className="text-[12.5px] text-ink-3">{i.role} · expires {date(i.expires_at)}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(i.id)}>Revoke</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a team member"
        description="They'll get an email and join by signing in with that Google account."
        footer={<><Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button><Button onClick={() => invite.mutate()} loading={invite.isPending} disabled={!email}>Send invitation</Button></>}
      >
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}>
          <Field label="Email"><Input type="email" autoFocus required placeholder="teacher@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Role" hint={ROLE_HELP[role]}>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="uploader">Uploader</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </Select>
          </Field>
        </form>
      </Modal>
      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        confirmLabel="Remove"
        title={`Remove ${removing?.name || removing?.email}?`}
        description="They lose access to this organization right away."
      />
    </div>
  );
}
