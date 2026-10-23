import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Users } from "lucide-react";

import { get, post, setOrgId } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Logo, Spinner } from "../components/ui";

export default function Invite() {
  const { token } = useParams();
  const { ready, me, reload, switchOrg } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ organization: string; role: string; email: string; email_matches: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !me) navigate(`/login?next=/invite/${token}`, { replace: true });
    if (ready && me) get(`/invitations/token/${token}`).then(setInfo).catch((e) => setError(e.message));
  }, [ready, me, token, navigate]);

  async function accept() {
    setBusy(true);
    try {
      const data = await post(`/invitations/token/${token}`);
      setOrgId(data.membership.organization.id);
      await reload();
      switchOrg(data.membership.organization.id);
      navigate("/app");
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="px-6 h-16 flex items-center"><Link to="/"><Logo /></Link></header>
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md bg-surface border border-line rounded-3xl shadow-card p-8 text-center animate-fade-up">
          {!info && !error && <Spinner />}
          {error && (
            <>
              <h1 className="text-[20px] font-semibold">This invitation can't be used</h1>
              <p className="mt-2 text-[14px] text-ink-3">{error}</p>
              <Button className="mt-6" variant="secondary" onClick={() => navigate("/app")}>Go to dashboard</Button>
            </>
          )}
          {info && !error && (
            <>
              <div className="size-14 mx-auto rounded-2xl bg-clay-soft text-clay flex items-center justify-center mb-5"><Users className="size-6" /></div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Join {info.organization}</h1>
              <p className="mt-2 text-[14px] text-ink-3">You've been invited as {info.role === "admin" ? "an admin" : `an ${info.role}`}.</p>
              {info.email_matches ? (
                <Button size="lg" className="mt-7 w-full" onClick={accept} loading={busy}>Accept invitation</Button>
              ) : (
                <p className="mt-6 text-[13.5px] text-bad bg-bad-soft rounded-2xl p-4">
                  This invitation is for {info.email}, but you're signed in as {me?.user.email}. Sign out and continue with that Google account.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
