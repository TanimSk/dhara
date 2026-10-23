import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Field, Input, Logo } from "../components/ui";

export default function Onboarding() {
  const { me, reload, switchOrg, signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invites = me?.pending_invitations ?? [];

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await post("/organizations", { name });
      await reload();
      switchOrg(data.membership.organization.id);
      navigate("/app");
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="px-6 h-16 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
        <Button variant="ghost" size="sm" onClick={() => signOut().then(() => navigate("/"))}>Sign out</Button>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[440px] animate-fade-up">
          <div className="text-center mb-8">
            <p className="text-[13px] font-medium text-clay mb-3">Step 1 of 1</p>
            <h1 className="font-display text-[42px] leading-[1.05]">Name your organization</h1>
            <p className="mt-3 text-[15px] text-ink-3">Usually your coaching center or company. You can invite your team next.</p>
          </div>
          <form onSubmit={create} className="bg-surface border border-line rounded-3xl shadow-card p-7 space-y-5">
            <Field label="Organization name">
              <Input autoFocus required maxLength={120} placeholder="e.g. Udvash Academic Care" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {error && <p className="text-[13px] text-bad">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>Create organization</Button>
            <p className="text-[12.5px] text-ink-3 text-center leading-relaxed">
              Every new account starts with a 14-day trial: 20 GB storage and 200 GB streaming. No card needed.
            </p>
          </form>
          {invites.length > 0 && (
            <div className="mt-6 bg-surface border border-line rounded-3xl p-5">
              <div className="text-[13px] font-medium mb-3">Or join a team you've been invited to</div>
              {invites.map((i) => (
                <div key={i.token} className="flex items-center justify-between py-2">
                  <span className="text-[14px]">{i.organization} <span className="text-ink-3">· {i.role}</span></span>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/invite/${i.token}`)}>View</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
