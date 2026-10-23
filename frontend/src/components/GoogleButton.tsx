import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: any;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Couldn't load Google Sign-In"));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/** Google's official button + One Tap. Calls onCredential with the ID token. */
export default function GoogleButton({ clientId, onCredential, oneTap = true, theme = "outline" }: { clientId: string; onCredential: (credential: string) => void; oneTap?: boolean; theme?: "outline" | "filled_black" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: { credential: string }) => cb.current(resp.credential),
          ux_mode: "popup",
          auto_select: true,
          itp_support: true,
          use_fedcm_for_prompt: true,
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme,
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          width: Math.min(360, ref.current.offsetWidth || 320),
        });
        if (oneTap) window.google.accounts.id.prompt();
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel?.();
    };
  }, [clientId, oneTap, theme]);

  return (
    <div>
      <div ref={ref} className="flex justify-center min-h-[44px]" />
      {error && <p className="text-[13px] text-bad mt-2 text-center">{error}</p>}
    </div>
  );
}
