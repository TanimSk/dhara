import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImageUp, Link2, Lock, RotateCw, Trash2 } from "lucide-react";

import { api, del, get, patch, post } from "../../lib/api";
import { useRole } from "../../lib/auth";
import { bytes, dateTime, duration } from "../../lib/format";
import type { Video } from "../../lib/types";
import { DailyBars } from "../../components/Charts";
import { StatusBadge } from "../../components/VideoBits";
import {
  Badge, Button, Card, CardHeader, CodeBlock, ConfirmModal, CopyField, EmptyState, LoadingBlock,
  ProgressBar, Select, SettingRow, Tabs, Toggle, useToast,
} from "../../components/ui";

const BUSY = new Set(["uploading", "queued", "encoding"]);

function Preview({ video }: { video: Video }) {
  // Private videos need a signed link even in the dashboard.
  const signed = useQuery({
    queryKey: ["preview-url", video.id, video.privacy],
    queryFn: () => post<{ embed: string }>(`/videos/${video.id}/signed-url`, { expires_in: 3600 }),
    enabled: video.status === "ready",
    staleTime: 30 * 60 * 1000,
  });
  if (video.status !== "ready") {
    return (
      <div className="aspect-video rounded-[20px] bg-[#141414] flex flex-col items-center justify-center text-center px-6">
        {video.status === "failed" ? (
          <>
            <p className="text-white text-[15px] font-medium">This video couldn't be encoded</p>
            <p className="text-white/55 text-[13px] mt-1.5 max-w-sm">{video.error || "Try uploading the file again."}</p>
          </>
        ) : (
          <>
            <p className="text-white text-[15px] font-medium">
              {video.status === "uploading" ? "Waiting for the upload to finish" : video.status === "queued" ? "Queued for encoding" : `Encoding · ${video.progress}%`}
            </p>
            <div className="w-56 mt-4"><ProgressBar value={video.status === "encoding" ? video.progress : 3} className="bg-white/15" tone="clay" /></div>
            <p className="text-white/45 text-[12.5px] mt-3">Encoding takes roughly as long as the video itself.</p>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="aspect-video rounded-[20px] overflow-hidden bg-black">
      {signed.data && <iframe src={signed.data.embed} title={video.title} className="w-full h-full" allow="fullscreen; picture-in-picture; autoplay; clipboard-write" allowFullScreen />}
    </div>
  );
}

function TokenGenerator({ video }: { video: Video }) {
  const [ttl, setTtl] = useState("14400");
  const gen = useMutation({ mutationFn: () => post<{ embed: string; hls: string; expires: number }>(`/videos/${video.id}/signed-url`, { expires_in: Number(ttl) }) });
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={ttl} onChange={(e) => setTtl(e.target.value)} className="sm:w-52">
          <option value="3600">Expires in 1 hour</option>
          <option value="14400">Expires in 4 hours</option>
          <option value="86400">Expires in 1 day</option>
          <option value="604800">Expires in 7 days</option>
        </Select>
        <Button variant="secondary" icon={<Link2 className="size-4" />} onClick={() => gen.mutate()} loading={gen.isPending}>Generate test link</Button>
      </div>
      {gen.data && (
        <div className="space-y-3 animate-fade-in">
          <CopyField label="Signed embed URL" value={gen.data.embed} />
          <CopyField label="Signed HLS URL" value={gen.data.hls} />
          <p className="text-[12.5px] text-ink-3">Valid until {dateTime(new Date(gen.data.expires * 1000).toISOString())}. In production, sign links on your own server - see the library's security settings.</p>
        </div>
      )}
    </div>
  );
}

export default function VideoPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { isManager } = useRole();
  const [title, setTitle] = useState("");
  const [tab, setTab] = useState<"embed" | "hls" | "signed">("embed");
  const [confirm, setConfirm] = useState(false);
  const thumbInput = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: ["video", id],
    queryFn: () => get<{ video: Video }>(`/videos/${id}`).then((d) => d.video),
    refetchInterval: (query) => (query.state.data && BUSY.has(query.state.data.status) ? 3000 : false),
  });
  const video = q.data;
  useEffect(() => { if (video) setTitle(video.title); }, [video?.title]); // eslint-disable-line

  const usage = useQuery({
    queryKey: ["video-usage", id],
    queryFn: () => get<{ results: { date: string; bytes_delivered: number }[]; total_bytes: number }>(`/videos/${id}/usage`),
    enabled: video?.status === "ready",
  });

  const save = useMutation({
    mutationFn: (body: Partial<Video>) => patch<{ video: Video }>(`/videos/${id}`, body),
    onSuccess: (d) => {
      qc.setQueryData(["video", id], d.video);
      qc.invalidateQueries({ queryKey: ["videos"] });
      toast("Saved");
    },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  const remove = useMutation({
    mutationFn: () => del(`/videos/${id}`),
    onSuccess: () => {
      toast("Video deleted");
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["libraries"] });
      navigate(`/app/libraries/${video!.library}`);
    },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  const reencode = useMutation({
    mutationFn: () => post(`/videos/${id}/reencode`),
    onSuccess: () => { toast("Queued for encoding"); q.refetch(); },
    onError: (e: Error) => toast(e.message, "bad"),
  });
  const thumb = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api<{ video: Video }>(`/videos/${id}/thumbnail`, { method: "POST", body: fd });
    },
    onSuccess: (d) => { qc.setQueryData(["video", id], d.video); toast("Thumbnail updated"); },
    onError: (e: Error) => toast(e.message, "bad"),
  });

  if (q.isLoading) return <LoadingBlock />;
  if (!video) return <EmptyState title="Video not found" description="It may have been deleted." />;

  const embedCode = `<div style="position:relative;padding-top:56.25%;"><iframe src="${video.urls.embed}" loading="lazy" style="border:0;position:absolute;inset:0;width:100%;height:100%;" allow="autoplay; fullscreen; picture-in-picture; clipboard-write" allowfullscreen></iframe></div>`;

  return (
    <div className="animate-fade-up">
      <Link to={`/app/libraries/${video.library}`} className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink mb-5">
        <ArrowLeft className="size-3.5" /> {video.library_name}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6 min-w-0">
          <div className="rounded-[26px] border border-line bg-surface p-2 shadow-card">
            <Preview video={video} />
          </div>

          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge video={video} />
              {video.privacy === "private" && <Badge tone="clay"><Lock className="size-3" /> Private</Badge>}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => { e.preventDefault(); if (title.trim() && title !== video.title) save.mutate({ title }); }}
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => title.trim() && title !== video.title && save.mutate({ title })}
                className="flex-1 min-w-0 bg-transparent text-[26px] font-semibold tracking-[-0.025em] rounded-xl px-2 -mx-2 py-1 hover:bg-sunken focus:bg-surface focus:outline-none focus:ring-4 focus:ring-ink/5"
                aria-label="Title"
              />
            </form>
          </div>

          {video.status === "ready" && (
            <Card>
              <CardHeader
                title="Share & embed"
                description="Paste the embed code into your course page, or use the HLS URL in your own player or app."
                action={<Tabs value={tab} onChange={setTab} tabs={[{ value: "embed", label: "Embed" }, { value: "hls", label: "HLS" }, { value: "signed", label: "Signed link" }]} />}
              />
              <div className="px-6 pb-6">
                {tab === "embed" && <CodeBlock language="HTML" code={embedCode} />}
                {tab === "hls" && (
                  <div className="space-y-3">
                    <CopyField value={video.urls.hls} label="HLS playlist" />
                    {video.privacy === "private" && <p className="text-[12.5px] text-ink-3">This video is private - the plain URL won't play. Use a signed link.</p>}
                  </div>
                )}
                {tab === "signed" && <TokenGenerator video={video} />}
              </div>
            </Card>
          )}

          {video.status === "ready" && (
            <Card>
              <CardHeader
                title="Streaming, last 30 days"
                description={usage.data ? `${bytes(usage.data.total_bytes)} delivered` : undefined}
              />
              <div className="px-4 pb-5">
                {usage.data ? <DailyBars data={usage.data.results} dataKey="bytes_delivered" format={(v) => bytes(v, 0)} /> : <LoadingBlock />}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="px-6 py-2">
            <SettingRow
              title="Private"
              description="Only plays with a signed link from your server."
              control={<Toggle checked={video.privacy === "private"} onChange={(v) => save.mutate({ privacy: v ? "private" : "public" })} label="Private" />}
            />
          </Card>

          <Card className="p-6">
            <h3 className="text-[14px] font-semibold mb-4">Details</h3>
            <dl className="space-y-3 text-[13.5px]">
              {[
                ["Duration", duration(video.duration_s)],
                ["Resolution", video.width ? `${video.width}×${video.height}` : "-"],
                ["Qualities", video.renditions.length ? video.renditions.map((r) => r.name).join(" · ") : "-"],
                ["Stored", bytes(video.storage_bytes)],
                ["Original", video.source_bytes ? bytes(video.source_bytes) : "-"],
                ["Uploaded", dateTime(video.created_at)],
                ["Video ID", <code key="id" className="font-mono text-[11.5px] break-all">{video.id}</code>],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4">
                  <dt className="text-ink-3 shrink-0">{k}</dt>
                  <dd className="text-right font-medium tabular min-w-0">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-6 space-y-2.5">
            {video.status === "ready" && (
              <>
                <Button variant="secondary" className="w-full" icon={<ImageUp className="size-4" />} onClick={() => thumbInput.current?.click()} loading={thumb.isPending}>Replace thumbnail</Button>
                <input ref={thumbInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) thumb.mutate(f); e.target.value = ""; }} />
              </>
            )}
            {video.status === "failed" && (
              <Button variant="secondary" className="w-full" icon={<RotateCw className="size-4" />} onClick={() => reencode.mutate()} loading={reencode.isPending}>Retry encoding</Button>
            )}
            {isManager && (
              <Button variant="danger" className="w-full" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>Delete video</Button>
            )}
          </Card>
        </div>
      </div>

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title="Delete this video?"
        description="It stops playing everywhere immediately and its files are removed. This can't be undone."
      />
    </div>
  );
}
