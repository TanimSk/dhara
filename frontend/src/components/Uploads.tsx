import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as tus from "tus-js-client";
import { Check, ChevronDown, Pause, Play, RotateCw, UploadCloud, X } from "lucide-react";

import { get, getAccessToken, post, refreshAccess } from "../lib/api";
import { bytes } from "../lib/format";
import type { Video } from "../lib/types";
import { ProgressBar, cx } from "./ui";

const ACCEPT = [".mp4", ".mov", ".mkv", ".webm"];
const MAX_BYTES = 10 * 1024 ** 3;

type UploadState = "preparing" | "uploading" | "paused" | "done" | "error";
interface UploadItem {
  key: string;
  file: File;
  title: string;
  libraryId: number;
  videoId?: string;
  state: UploadState;
  sent: number;
  speed: number; // bytes/s
  error?: string;
  resumed?: boolean;
}

interface UploadsApi {
  items: UploadItem[];
  addFiles: (libraryId: number, files: File[]) => void;
}

const Ctx = createContext<UploadsApi>({ items: [], addFiles: () => {} });
export const useUploads = () => useContext(Ctx);

export function titleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled video";
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const uploads = useRef(new Map<string, tus.Upload>());
  const qc = useQueryClient();

  const update = useCallback((key: string, patch: Partial<UploadItem>) => {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }, []);

  // Warn before leaving while bytes are in flight.
  useEffect(() => {
    const active = items.some((i) => i.state === "uploading" || i.state === "preparing");
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [items]);

  const start = useCallback(
    async (item: UploadItem) => {
      const { key, file, libraryId } = item;
      update(key, { state: "preparing", error: undefined });
      await refreshAccess(); // fresh token for the tus pre-create hook

      let lastT = performance.now(), lastB = 0;
      const upload = new tus.Upload(file, {
        endpoint: `${window.location.origin}/upload/`,
        chunkSize: 32 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000, 60000],
        removeFingerprintOnSuccess: true,
        storeFingerprintForResuming: true,
        metadata: { filename: file.name, filetype: file.type || "video/mp4" },
        onBeforeRequest: (req) => {
          const token = getAccessToken();
          if (token) req.setHeader("Authorization", `Bearer ${token}`);
        },
        onShouldRetry: (err) => {
          const status = (err as tus.DetailedError).originalResponse?.getStatus();
          return !status || status >= 500 || status === 423 || status === 409;
        },
        onProgress: (sent) => {
          const now = performance.now();
          if (now - lastT > 800) {
            const speed = ((sent - lastB) / (now - lastT)) * 1000;
            lastT = now;
            lastB = sent;
            update(key, { sent, speed, state: "uploading" });
          }
        },
        onSuccess: () => {
          update(key, { state: "done", sent: file.size });
          qc.invalidateQueries({ queryKey: ["videos"] });
        },
        onError: (err) => {
          let message = "Upload failed. Check your connection and retry.";
          const body = (err as tus.DetailedError).originalResponse?.getBody();
          try {
            if (body) message = JSON.parse(body).message || message;
          } catch {
            /* not JSON */
          }
          update(key, { state: "error", error: message });
        },
      });
      uploads.current.set(key, upload);

      try {
        // Same file added again (e.g. after a reload)? Continue its unfinished upload.
        let videoId: string | undefined;
        const previous = await upload.findPreviousUploads();
        for (const p of previous) {
          const id = p.metadata?.video_id;
          if (!id) continue;
          const v = await get<{ video: Video }>(`/videos/${id}`).then((d) => d.video).catch(() => null);
          if (v && v.status === "uploading" && v.library === libraryId) {
            upload.resumeFromPreviousUpload(p);
            videoId = id;
            update(key, { resumed: true, title: v.title });
            break;
          }
        }
        if (!videoId) {
          const created = await post<{ video: Video }>(`/libraries/${libraryId}/videos`, { title: item.title, filename: file.name });
          videoId = created.video.id;
          qc.invalidateQueries({ queryKey: ["videos"] });
        }
        upload.options.metadata = { ...upload.options.metadata, video_id: videoId };
        update(key, { videoId, state: "uploading" });
        upload.start();
      } catch (e: any) {
        update(key, { state: "error", error: e.message || "Couldn't start the upload" });
      }
    },
    [qc, update],
  );

  const addFiles = useCallback(
    (libraryId: number, files: File[]) => {
      const fresh: UploadItem[] = [];
      for (const file of files) {
        const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
        const base = { key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`, file, title: titleFromFilename(file.name), libraryId, sent: 0, speed: 0 };
        if (!ACCEPT.includes(ext)) fresh.push({ ...base, state: "error", error: "Use an MP4, MOV, MKV or WebM file." });
        else if (file.size > MAX_BYTES) fresh.push({ ...base, state: "error", error: "Files can be at most 10 GB." });
        else fresh.push({ ...base, state: "preparing" });
      }
      setItems((xs) => [...fresh, ...xs]);
      fresh.filter((f) => f.state === "preparing").forEach((f) => start(f));
    },
    [start],
  );

  const pause = (key: string) => {
    uploads.current.get(key)?.abort();
    update(key, { state: "paused" });
  };
  const resume = (item: UploadItem) => {
    const u = uploads.current.get(item.key);
    if (u && item.videoId) {
      update(item.key, { state: "uploading", error: undefined });
      u.start();
    } else start(item);
  };
  const dismiss = (key: string) => {
    uploads.current.get(key)?.abort();
    uploads.current.delete(key);
    setItems((xs) => xs.filter((x) => x.key !== key));
  };

  return (
    <Ctx.Provider value={{ items, addFiles }}>
      {children}
      <UploadTray items={items} onPause={pause} onResume={resume} onDismiss={dismiss} />
    </Ctx.Provider>
  );
}

function UploadTray({ items, onPause, onResume, onDismiss }: {
  items: UploadItem[]; onPause: (k: string) => void; onResume: (i: UploadItem) => void; onDismiss: (k: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0) return null;
  const active = items.filter((i) => i.state === "uploading" || i.state === "preparing").length;
  const done = items.filter((i) => i.state === "done").length;

  return (
    <div className="fixed z-40 bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] rounded-3xl border border-line bg-surface/95 backdrop-blur-xl shadow-float animate-fade-up overflow-hidden">
      <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center gap-3 px-5 h-14 text-left">
        <span className="size-8 rounded-xl bg-sunken flex items-center justify-center">
          {active ? <UploadCloud className="size-4 text-ink" /> : <Check className="size-4 text-ok" />}
        </span>
        <span className="flex-1 text-[14px] font-semibold">
          {active ? `Uploading ${active} ${active === 1 ? "file" : "files"}` : `${done} ${done === 1 ? "upload" : "uploads"} complete`}
        </span>
        <ChevronDown className={cx("size-4 text-ink-3 transition-transform", collapsed && "rotate-180")} />
      </button>
      {!collapsed && (
        <div className="max-h-[50vh] overflow-y-auto border-t border-line divide-y divide-line">
          {items.map((i) => {
            const pct = i.file.size ? (i.sent / i.file.size) * 100 : 0;
            const eta = i.speed > 0 ? Math.round((i.file.size - i.sent) / i.speed) : 0;
            return (
              <div key={i.key} className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium truncate">{i.title}</div>
                    <div className={cx("text-[12px] mt-0.5", i.state === "error" ? "text-bad" : "text-ink-3")}>
                      {i.state === "error" && i.error}
                      {i.state === "preparing" && "Preparing…"}
                      {i.state === "paused" && `Paused · ${bytes(i.sent)} of ${bytes(i.file.size)}`}
                      {i.state === "uploading" &&
                        `${bytes(i.sent)} of ${bytes(i.file.size)}${i.speed ? ` · ${bytes(i.speed)}/s` : ""}${eta ? ` · ${eta > 90 ? Math.round(eta / 60) + " min" : eta + " s"} left` : ""}${i.resumed ? " · resumed" : ""}`}
                      {i.state === "done" && "Uploaded - encoding next"}
                    </div>
                  </div>
                  {i.state === "uploading" && <IconBtn onClick={() => onPause(i.key)} label="Pause"><Pause className="size-3.5" /></IconBtn>}
                  {i.state === "paused" && <IconBtn onClick={() => onResume(i)} label="Resume"><Play className="size-3.5" /></IconBtn>}
                  {i.state === "error" && i.error && !i.error.startsWith("Use an") && !i.error.startsWith("Files can") && (
                    <IconBtn onClick={() => onResume(i)} label="Retry"><RotateCw className="size-3.5" /></IconBtn>
                  )}
                  {(i.state !== "uploading" && i.state !== "preparing") && <IconBtn onClick={() => onDismiss(i.key)} label="Dismiss"><X className="size-3.5" /></IconBtn>}
                </div>
                {(i.state === "uploading" || i.state === "paused" || i.state === "preparing") && (
                  <ProgressBar className="mt-2.5" value={pct} tone={i.state === "paused" ? "warn" : "ink"} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="size-7 rounded-full flex items-center justify-center text-ink-3 hover:bg-sunken hover:text-ink">
      {children}
    </button>
  );
}

export { ACCEPT };
