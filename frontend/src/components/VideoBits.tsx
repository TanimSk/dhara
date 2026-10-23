import { AlertCircle, Clock, Film, Lock } from "lucide-react";

import { duration } from "../lib/format";
import type { Video } from "../lib/types";
import { Badge, ProgressBar, cx } from "./ui";

export function StatusBadge({ video }: { video: Video }) {
  switch (video.status) {
    case "ready":
      return <Badge tone="ok" dot>Ready</Badge>;
    case "encoding":
      return <Badge tone="info" dot>Encoding {video.progress}%</Badge>;
    case "queued":
      return <Badge tone="neutral" dot>Queued</Badge>;
    case "uploading":
      return <Badge tone="warn" dot>Uploading</Badge>;
    case "failed":
      return <Badge tone="bad" dot>Failed</Badge>;
  }
}

export function Thumbnail({ video, className }: { video: Video; className?: string }) {
  const busy = video.status === "encoding" || video.status === "queued" || video.status === "uploading";
  return (
    <div className={cx("relative aspect-video rounded-2xl overflow-hidden bg-sunken border border-line/70", className)}>
      {video.urls.thumbnail && video.status === "ready" ? (
        <img src={video.urls.thumbnail} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-4">
          {video.status === "failed" ? <AlertCircle className="size-6 text-bad/70" /> : busy ? <Clock className="size-6" /> : <Film className="size-6" />}
        </div>
      )}
      {video.status === "ready" && video.duration_s != null && (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/65 backdrop-blur px-1.5 py-0.5 text-[11px] font-semibold text-white tabular">{duration(video.duration_s)}</span>
      )}
      {video.privacy === "private" && (
        <span className="absolute top-2 left-2 rounded-full bg-white/90 backdrop-blur px-2 py-0.5 text-[11px] font-semibold text-ink flex items-center gap-1"><Lock className="size-3" />Private</span>
      )}
      {video.status === "encoding" && (
        <div className="absolute inset-x-3 bottom-3"><ProgressBar value={video.progress} className="bg-white/70" /></div>
      )}
    </div>
  );
}
