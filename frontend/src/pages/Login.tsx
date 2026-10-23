import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import GoogleButton from "../components/GoogleButton";
import { Button, Input, Logo, Spinner } from "../components/ui";
import { useDarkTheme } from "../components/landing/motion";

interface Config { google_client_id: string; dev_login: boolean }

export default function Login() {
  useDarkTheme();
  const { me, ready, signIn } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next") || "/app";
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [devEmail, setDevEmail] = useState("");

  useEffect(() => {
    api<Config>("/auth/config", { org: false }).then(setConfig).catch(() => setError("Can't reach the server."));
  }, []);

  useEffect(() => {
    if (ready && me) navigate(next.startsWith("/") ? next : "/app", { replace: true });
  }, [ready, me, next, navigate]);

  async function finish(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ access: string }>(path, { method: "POST", body, org: false });
      await signIn(data.access);
    } catch (e: any) {
      setError(e.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="px-6 h-16 flex items-center">
        <Link to="/"><Logo /></Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px] animate-fade-up">
          <div className="text-center mb-10">
            <h1 className="text-[40px] sm:text-[48px] leading-[1.02] font-semibold tracking-[-0.045em]">Welcome to dhara.</h1>
            <p className="mt-3 text-[15px] text-ink-3">Sign in with Google to continue. New here? The same button creates your account.</p>
          </div>
          <div className="bg-surface border border-line rounded-3xl shadow-card p-7">
            {!config && !error && <div className="flex justify-center py-3"><Spinner /></div>}
            {config && config.google_client_id && (
              <GoogleButton theme="filled_black" clientId={config.google_client_id} onCredential={(credential) => finish("/auth/google", { credential })} />
            )}
            {config && !config.google_client_id && (
              <p className="text-[13px] text-ink-3 text-center leading-relaxed">
                Google Sign-In isn't configured yet. Set <code className="font-mono text-ink-2">GOOGLE_CLIENT_ID</code> in backend/.env.
              </p>
            )}
            {busy && <div className="flex justify-center mt-4"><Spinner /></div>}
            {error && <p className="mt-4 text-[13px] text-bad text-center">{error}</p>}

            {config?.dev_login && (
              <form
                className="mt-6 pt-6 border-t border-dashed border-line"
                onSubmit={(e) => {
                  e.preventDefault();
                  finish("/auth/dev-login", { email: devEmail });
                }}
              >
                <div className="text-[12px] font-medium text-warn mb-2">Local development sign-in</div>
                <div className="flex gap-2">
                  <Input type="email" required placeholder="you@example.com" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} />
                  <Button type="submit" variant="secondary" loading={busy}>Go</Button>
                </div>
              </form>
            )}
          </div>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-[12.5px] text-ink-3">
            <ShieldCheck className="size-3.5" /> We only read your name, email and photo.
          </p>
        </div>
      </main>
    </div>
  );
}
