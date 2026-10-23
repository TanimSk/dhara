import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Film, Search, Settings2, Square, Trash2, UploadCloud } from "lucide-react";

import { get, post } from "../../lib/api";
import { useAuth, useRole } from "../../lib/auth";
import { bytes, relative } from "../../lib/format";
import type { Library, Page, Video } from "../../lib/types";
import { ACCEPT, useUploads } from "../../components/Uploads";
import { StatusBadge, Thumbnail } from "../../components/VideoBits";
import { Button, ConfirmModal, EmptyState, Input, LoadingBlock, PageHeader, Select, cx, useToast } from "../../components/ui";

const BUSY = new Set(["uploading", "queued", "encoding"]);

export default function LibraryPage() {
  const { id } = useParams();
  const libraryId = Number(id);
  const { membership } = useAuth();
  const { isManager } = useRole();
  const { addFiles } = useUploads();
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { setSelected(new Set()); setPage(1); }, [libraryId]);

  const library = useQuery({ queryKey: ["library", libraryId], queryFn: () => get<{ library: Library }>(`/libraries/${libraryId}`).then((d) => d.library) });
  const params = new URLSearchParams({ p: String(page), sort, ...(search && { q: search }), ...(status && { status }) });
  const videos = useQuery({
    queryKey: ["videos", libraryId, params.toString()],
    queryFn: () => get<Page<Video>>(`/libraries/${libraryId}/videos?${params}`),
    placeholderData: keepPreviousData,
    // Live encode progress: poll every 3 s while anything is in flight.
    refetchInterval: (query) => (query.state.data?.results.some((v) => BUSY.has(v.status)) ? 3000 : false),
  });

  const bulkDelete = useMutation({
    mutationFn: () => post(`/libraries/${libraryId}/videos/bulk-delete`, { ids: [...selected] }),
    onSuccess: (d) => {
      toast(`Deleted ${d.deleted} ${d.deleted === 1 ? "video" : "videos"}`);
      setSelected(new Set());
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["videos", libraryId] });
      qc.invalidateQueries({ queryKey: ["libraries"] });
    },
    onError: (e: Error) => toast(e.message, "bad"),
  });

  const canUpload = membership?.organization.status === "trial" || membership?.organization.status === "active";
  const onFiles = (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    if (!canUpload) return toast("Uploads open once your trial is approved.", "bad");
    addFiles(libraryId, Array.from(files));
  };

  const toggle = (vid: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(vid) ? n.delete(vid) : n.add(vid);
      return n;
    });

  if (library.isLoading) return <LoadingBlock />;
  if (library.isError) return <EmptyState title="Library not found" description="It may have been deleted." />;
  const lib = library.data!;
  const list = videos.data?.results ?? [];
  const filtering = Boolean(search || status);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
      className="relative"
    >
      <PageHeader
        eyebrow="Library"
        title={lib.name}
        description={`${lib.video_count} ${lib.video_count === 1 ? "video" : "videos"} · ${bytes(lib.storage_bytes)} stored`}
        actions={
          <>
            {isManager && (
              <Link to={`/app/libraries/${libraryId}/settings`}>
                <Button variant="secondary" icon={<Settings2 className="size-4" />}>Settings</Button>
              </Link>
            )}
            <Button icon={<UploadCloud className="size-4" />} onClick={() => fileInput.current?.click()}>Upload</Button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT.join(",") + ",video/*"} className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          </>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
          <Input className="pl-10" placeholder="Search videos" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-40">
            <option value="">All statuses</option>
            <option value="ready">Ready</option>
            <option value="uploading,queued,encoding">In progress</option>
            <option value="failed">Failed</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="sm:w-40">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="title">Title</option>
            <option value="duration">Longest</option>
            <option value="size">Largest</option>
          </Select>
        </div>
      </div>

      {isManager && selected.size > 0 && (
        <div className="sticky top-16 lg:top-4 z-20 mb-5 flex items-center justify-between rounded-2xl bg-ink text-white px-5 h-12 shadow-float animate-fade-in">
          <span className="text-[13.5px] font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="!text-white/80 hover:!bg-white/10" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" variant="secondary" className="!text-bad" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm(true)}>Delete</Button>
          </div>
        </div>
      )}

      {videos.isLoading ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-line-strong/70 bg-surface/60">
          {filtering ? (
            <EmptyState icon={<Search className="size-6" />} title="No matching videos" description="Try a different search or filter." />
          ) : (
            <EmptyState
              icon={<Film className="size-6" />}
              title="Drop your first class here"
              description="MP4, MOV, MKV or WebM, up to 10 GB. Uploads resume if your connection drops."
              action={<Button icon={<UploadCloud className="size-4" />} onClick={() => fileInput.current?.click()}>Choose files</Button>}
            />
          )}
        </div>
      ) : (
        <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <div key={v.id} className="group relative animate-fade-in">
              <Link to={`/app/videos/${v.id}`} className="block">
                <Thumbnail video={v} className="group-hover:shadow-card transition-shadow" />
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[14.5px] font-medium leading-snug truncate group-hover:text-clay transition-colors">{v.title}</h3>
                    <p className="text-[12.5px] text-ink-3 mt-0.5">{relative(v.created_at)}{v.storage_bytes ? ` · ${bytes(v.storage_bytes)}` : ""}</p>
                  </div>
                  <StatusBadge video={v} />
                </div>
              </Link>
              {isManager && (
                <button
                  onClick={() => toggle(v.id)}
                  className={cx(
                    "absolute top-2 right-2 size-8 rounded-xl flex items-center justify-center bg-white/90 backdrop-blur shadow-soft transition-opacity",
                    selected.has(v.id) ? "opacity-100 text-ink" : "opacity-0 group-hover:opacity-100 text-ink-3",
                  )}
                  aria-label={selected.has(v.id) ? "Deselect" : "Select"}
                >
                  {selected.has(v.id) ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {videos.data && videos.data.num_pages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-[13px] text-ink-3 tabular">Page {page} of {videos.data.num_pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= videos.data.num_pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {dragging && (
        <div className="fixed inset-0 z-50 bg-canvas/80 backdrop-blur-sm flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="rounded-[32px] border-2 border-dashed border-clay bg-surface px-16 py-14 text-center shadow-float">
            <UploadCloud className="size-10 text-clay mx-auto" />
            <p className="mt-4 text-[18px] font-semibold">Drop to upload to {lib.name}</p>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => bulkDelete.mutate()}
        loading={bulkDelete.isPending}
        title={`Delete ${selected.size} ${selected.size === 1 ? "video" : "videos"}?`}
        description="They'll stop playing everywhere immediately, and their files are removed. This can't be undone."
      />
    </div>
  );
}
