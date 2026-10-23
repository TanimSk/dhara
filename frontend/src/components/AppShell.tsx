import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  Check,
  ChevronsUpDown,
  CreditCard,
  FolderClosed,
  KeyRound,
  LogOut,
  Menu,
  Plus,
  Settings,
  Shield,
  Users,
  X,
} from "lucide-react";

import { post } from "../lib/api";
import { useAuth, useRole } from "../lib/auth";
import { date } from "../lib/format";
import { useLibraries } from "../hooks/queries";
import { UploadProvider } from "./Uploads";
import { Avatar, Badge, Button, Field, Input, Logo, Modal, cx, useToast } from "./ui";

function OrgSwitcher() {
  const { me, membership, switchOrg } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (!membership) return null;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 rounded-2xl px-2.5 py-2 hover:bg-sunken transition-colors text-left">
        <span className="size-8 rounded-xl bg-ink text-white flex items-center justify-center text-[13px] font-semibold shrink-0">
          {membership.organization.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold truncate">{membership.organization.name}</span>
          <span className="block text-[12px] text-ink-3 capitalize">{membership.role}</span>
        </span>
        <ChevronsUpDown className="size-4 text-ink-3" />
      </button>
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-2xl border border-line bg-surface shadow-float p-1.5 animate-fade-in">
          {me!.memberships.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                switchOrg(m.organization.id);
                setOpen(false);
                navigate("/app");
              }}
              className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-sunken text-left"
            >
              <span className="size-6 rounded-lg bg-sunken border border-line flex items-center justify-center text-[11px] font-semibold">{m.organization.name[0]?.toUpperCase()}</span>
              <span className="flex-1 truncate text-[13.5px]">{m.organization.name}</span>
              {m.organization.id === membership.organization.id && <Check className="size-4 text-ink" />}
            </button>
          ))}
          <div className="h-px bg-line my-1.5" />
          <button onClick={() => navigate("/onboarding")} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-sunken text-[13.5px] text-ink-2">
            <Plus className="size-4" /> New organization
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({ to, icon: Icon, children, end }: { to: string; icon: any; children: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          "flex items-center gap-3 h-9 px-3 rounded-xl text-[13.5px] font-medium transition-colors",
          isActive ? "bg-surface text-ink shadow-soft border border-line" : "text-ink-2 hover:bg-sunken hover:text-ink border border-transparent",
        )
      }
    >
      <Icon className="size-[17px]" strokeWidth={1.8} />
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

function NewLibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const create = useMutation({
    mutationFn: () => post("/libraries", { name }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast("Library created");
      onClose();
      setName("");
      navigate(`/app/libraries/${d.library.id}`);
    },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New library"
      description="Libraries group videos - by course, batch or brand - and each has its own security settings."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>Create library</Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
        <Field label="Name"><Input autoFocus placeholder="e.g. HSC Physics 2026" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, signOut } = useAuth();
  const { isManager, isOwner } = useRole();
  const { data: libraries } = useLibraries();
  const [newLib, setNewLib] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      <div className="px-4 h-16 flex items-center">
        <Link to="/app"><Logo /></Link>
      </div>
      <div className="px-2.5"><OrgSwitcher /></div>

      <div className="mt-5 px-3 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-3 mb-1.5">
          <span className="text-[11.5px] font-semibold text-ink-3 uppercase tracking-[0.06em]">Libraries</span>
          {isManager && (
            <button onClick={() => setNewLib(true)} className="size-6 rounded-lg flex items-center justify-center text-ink-3 hover:bg-sunken hover:text-ink" aria-label="New library">
              <Plus className="size-4" />
            </button>
          )}
        </div>
        <div className="space-y-0.5">
          {libraries?.map((lib) => (
            <NavItem key={lib.id} to={`/app/libraries/${lib.id}`} icon={FolderClosed}>{lib.name}</NavItem>
          ))}
          {libraries && libraries.length === 0 && <p className="px-3 py-2 text-[12.5px] text-ink-3">No libraries yet.</p>}
        </div>

        <div className="mt-7 px-3 mb-1.5 text-[11.5px] font-semibold text-ink-3 uppercase tracking-[0.06em]">Organization</div>
        <div className="space-y-0.5">
          {isManager && <NavItem to="/app/usage" icon={BarChart3}>Usage</NavItem>}
          {isManager && <NavItem to="/app/team" icon={Users}>Team</NavItem>}
          {isManager && <NavItem to="/app/api-keys" icon={KeyRound}>API keys</NavItem>}
          {isOwner && <NavItem to="/app/billing" icon={CreditCard}>Billing</NavItem>}
          {isOwner && <NavItem to="/app/settings" icon={Settings}>Settings</NavItem>}
          {me?.user.is_staff && <NavItem to="/admin" icon={Shield}>Super admin</NavItem>}
        </div>
      </div>

      <div className="p-3 border-t border-line flex items-center gap-3">
        <Avatar name={me?.user.name || me?.user.email || ""} src={me?.user.avatar_url} size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium truncate">{me?.user.name || "Account"}</div>
          <div className="text-[12px] text-ink-3 truncate">{me?.user.email}</div>
        </div>
        <button onClick={() => signOut().then(() => navigate("/"))} className="size-8 rounded-xl flex items-center justify-center text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
      <NewLibraryModal open={newLib} onClose={() => setNewLib(false)} />
    </div>
  );
}

function StatusBanner() {
  const { membership } = useAuth();
  const org = membership?.organization;
  if (!org) return null;
  if (org.status === "pending")
    return (
      <div className="mb-6 rounded-2xl border border-warn/25 bg-warn-soft px-5 py-3.5 text-[13.5px] text-[#7a5212] flex items-center gap-3">
        <Building2 className="size-4 shrink-0" />
        Your free trial is awaiting approval. We usually approve within a few hours - you can set up libraries meanwhile.
      </div>
    );
  if (org.status === "suspended")
    return (
      <div className="mb-6 rounded-2xl border border-bad/25 bg-bad-soft px-5 py-3.5 text-[13.5px] text-bad">
        This organization is suspended, and its videos aren't playing. Contact support to restore access.
      </div>
    );
  if (org.status === "trial" && org.trial_ends_at)
    return (
      <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-3 text-[13.5px] shadow-soft">
        <span className="flex items-center gap-2.5"><Badge tone="clay">Trial</Badge> Your trial runs until {date(org.trial_ends_at)}.</span>
        {membership.role === "owner" && <Link to="/app/billing" className="font-medium text-clay hover:underline whitespace-nowrap">Choose a plan</Link>}
      </div>
    );
  return null;
}

export default function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <UploadProvider>
    <div className="min-h-dvh lg:pl-[264px]">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[264px] border-r border-line bg-canvas/80 backdrop-blur-xl">
        <Sidebar />
      </aside>

      <div className="lg:hidden sticky top-0 z-30 h-14 px-4 flex items-center justify-between bg-canvas/85 backdrop-blur-xl border-b border-line">
        <button onClick={() => setDrawer(true)} className="size-9 -ml-2 rounded-xl flex items-center justify-center hover:bg-sunken" aria-label="Menu"><Menu className="size-5" /></button>
        <Logo />
        <span className="w-7" />
      </div>
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/20 animate-fade-in" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[284px] bg-canvas border-r border-line shadow-float animate-fade-in">
            <button onClick={() => setDrawer(false)} className="absolute top-4 right-3 size-8 rounded-xl flex items-center justify-center hover:bg-sunken" aria-label="Close"><X className="size-4" /></button>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-[1180px] px-4 sm:px-8 py-8 sm:py-10">
        <StatusBanner />
        <Outlet />
      </main>
    </div>
    </UploadProvider>
  );
}
