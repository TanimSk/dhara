import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Globe2, Plus, RefreshCw, X } from "lucide-react";

import { del, get, patch, post } from "../../lib/api";
import type { Library } from "../../lib/types";
import {
  Button, Card, CardHeader, CodeBlock, ConfirmModal, CopyField, Field, Input, LoadingBlock, PageHeader, Select,
  SettingRow, Tabs, Toggle, useToast,
} from "../../components/ui";

const EDGE = (import.meta.env.VITE_EDGE_URL as string | undefined) || "http://localhost:8787";

function samples(libraryId: number) {
  const vid = "VIDEO_ID";
  return {
    python: `import base64, hashlib, hmac, os, time

LIBRARY_ID = ${libraryId}
SECURITY_KEY = os.environ["DHARA_LIBRARY_KEY"]  # keep it on your server

def signed_embed_url(video_id, ttl=4 * 3600):
    exp = int(time.time()) + ttl
    msg = f"{LIBRARY_ID}/{video_id}/{exp}".encode()
    sig = hmac.new(SECURITY_KEY.encode(), msg, hashlib.sha256).digest()
    tok = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"${EDGE}/embed/{LIBRARY_ID}/{video_id}?token={tok}&expires={exp}"

print(signed_embed_url("${vid}"))`,
    php: `<?php
$lib = ${libraryId};
$key = getenv('DHARA_LIBRARY_KEY'); // keep it on your server
$vid = '${vid}';
$exp = time() + 14400;
$tok = rtrim(strtr(base64_encode(hash_hmac('sha256', "$lib/$vid/$exp", $key, true)), '+/', '-_'), '=');
$url = "${EDGE}/embed/$lib/$vid?token=$tok&expires=$exp";`,
    node: `import { createHmac } from "node:crypto";

const LIBRARY_ID = ${libraryId};
const SECURITY_KEY = process.env.DHARA_LIBRARY_KEY; // keep it on your server

export function signedEmbedUrl(videoId, ttl = 4 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const tok = createHmac("sha256", SECURITY_KEY).update(\`\${LIBRARY_ID}/\${videoId}/\${exp}\`).digest("base64url");
  return \`${EDGE}/embed/\${LIBRARY_ID}/\${videoId}?token=\${tok}&expires=\${exp}\`;
}`,
    hls: `${EDGE}/t/{token}/{expires}/${libraryId}/{video_id}/playlist.m3u8`,
  };
}

export default function LibrarySettings() {
  const { id } = useParams();
  const libraryId = Number(id);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [lang, setLang] = useState<"python" | "php" | "node">("python");
  const [rotateOpen, setRotateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const q = useQuery({ queryKey: ["library", libraryId], queryFn: () => get<{ library: Library }>(`/libraries/${libraryId}`).then((d) => d.library) });
  const key = useQuery({ queryKey: ["library-key", libraryId], queryFn: () => get<{ security_key: string }>(`/libraries/${libraryId}/security-key`) });
  const lib = q.data;
  useEffect(() => { if (lib) setName(lib.name); }, [lib?.name]); // eslint-disable-line

  const save = useMutation({
    mutationFn: (body: Partial<Library>) => patch<{ library: Library }>(`/libraries/${libraryId}`, body),
    onSuccess: (d) => {
      qc.setQueryData(["library", libraryId], d.library);
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast("Saved - live on the edge in seconds");
    },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  const rotate = useMutation({
    mutationFn: () => post<{ security_key: string }>(`/libraries/${libraryId}/rotate-key`),
    onSuccess: (d) => {
      qc.setQueryData(["library-key", libraryId], d);
      setRotateOpen(false);
      toast("Key rotated. Old links no longer work.");
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/libraries/${libraryId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast("Library deleted");
      navigate("/app");
    },
    onError: (e: Error) => toast(e.message, "bad"),
  });

  if (q.isLoading || !lib) return <LoadingBlock />;
  const code = samples(libraryId);

  function addDomain(e: React.FormEvent) {
    e.preventDefault();
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!d || lib!.allowed_domains.includes(d)) return setDomain("");
    save.mutate({ allowed_domains: [...lib!.allowed_domains, d] }, { onSuccess: () => setDomain("") });
  }

  return (
    <div>
      <Link to={`/app/libraries/${libraryId}`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink mb-5">
        <ArrowLeft className="size-3.5" /> {lib.name}
      </Link>
      <PageHeader title="Library settings" description="Security settings apply to every video in this library and reach the edge within seconds." />

      <div className="space-y-6 max-w-3xl">
        <Card>
          <CardHeader title="General" />
          <div className="px-6 pb-6 grid gap-5 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== lib.name && save.mutate({ name })} />
            </Field>
            <Field label="New uploads are" hint="You can still change each video later.">
              <Select value={lib.default_privacy} onChange={(e) => save.mutate({ default_privacy: e.target.value as Library["default_privacy"] })}>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Allowed domains"
            description="The player and stream only load on these websites. Leave empty to allow embedding anywhere. Use *.example.com to include subdomains."
          />
          <div className="px-6 pb-6">
            <form onSubmit={addDomain} className="flex gap-2">
              <div className="relative flex-1">
                <Globe2 className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
                <Input className="pl-10" placeholder="yourschool.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
              </div>
              <Button type="submit" variant="secondary" icon={<Plus className="size-4" />} disabled={!domain.trim()}>Add</Button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {lib.allowed_domains.length === 0 && <span className="text-[13px] text-ink-3">No restriction - any website can embed these videos.</span>}
              {lib.allowed_domains.map((d) => (
                <span key={d} className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-full bg-sunken border border-line text-[13px] font-medium">
                  {d}
                  <button
                    onClick={() => save.mutate({ allowed_domains: lib.allowed_domains.filter((x) => x !== d) })}
                    className="size-5 rounded-full flex items-center justify-center text-ink-3 hover:bg-line hover:text-ink"
                    aria-label={`Remove ${d}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card className="px-6 py-2">
          <SettingRow
            title="Require signed links for every video"
            description="Even public videos need a token from your server. Private videos always do. Use this for paid courses."
            control={<Toggle checked={lib.token_auth_enabled} onChange={(v) => save.mutate({ token_auth_enabled: v })} label="Require signed links" />}
          />
          <SettingRow
            title="Allow direct access"
            description="Allow requests with no referring website, such as your mobile app or a native player. Turn off if you only embed on the web."
            control={<Toggle checked={lib.allow_direct_access} onChange={(v) => save.mutate({ allow_direct_access: v })} label="Allow direct access" />}
          />
        </Card>

        <Card>
          <CardHeader
            title="Security key"
            description="Your server signs playback links with this key. Never put it in a web page or app."
            action={<Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => setRotateOpen(true)}>Rotate</Button>}
          />
          <div className="px-6 pb-6 space-y-5">
            {key.data && <CopyField value={key.data.security_key} secret />}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium">Sign a link on your server</span>
              <Tabs value={lang} onChange={setLang} tabs={[{ value: "python", label: "Python" }, { value: "php", label: "PHP" }, { value: "node", label: "Node.js" }]} />
            </div>
            <CodeBlock language={lang === "python" ? "Python" : lang === "php" ? "PHP" : "Node.js"} code={code[lang]} />
            <div>
              <div className="text-[13px] font-medium mb-1.5">Signed HLS (for your own player or app)</div>
              <code className="block text-[12.5px] font-mono text-ink-2 bg-sunken/60 border border-line rounded-xl px-3.5 py-3 break-all">{code.hls}</code>
            </div>
            <p className="text-[12.5px] text-ink-3 leading-relaxed">
              Set the expiry to the video's length plus an hour so playback never breaks mid-class. Library ID: <code className="font-mono text-ink-2">{libraryId}</code>
            </p>
          </div>
        </Card>

        <Card className="border-bad/20">
          <CardHeader
            title="Delete library"
            description="Deletes every video in it. They stop playing immediately and can't be recovered."
            action={<Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>Delete library</Button>}
          />
        </Card>
      </div>

      <ConfirmModal
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        onConfirm={() => rotate.mutate()}
        loading={rotate.isPending}
        confirmLabel="Rotate key"
        title="Rotate the security key?"
        description="Every signed link you've issued stops working immediately. Update the key on your server right after."
      />
      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title={`Delete ${lib.name}?`}
        description={`This deletes ${lib.video_count} ${lib.video_count === 1 ? "video" : "videos"} permanently.`}
      />
    </div>
  );
}
