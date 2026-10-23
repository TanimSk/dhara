import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";

import { get, post } from "../../lib/api";
import { dateTime, relative } from "../../lib/format";
import type { EncodeJob, Page } from "../../lib/types";
import { Badge, Button, Card, LoadingBlock, PageHeader, ProgressBar, Tabs, useToast } from "../../components/ui";

const TONE = { queued: "neutral", running: "info", done: "ok", failed: "bad" } as const;

export default function AdminEncoder() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<"" | "queued" | "running" | "failed" | "done">("");
  const [openLog, setOpenLog] = useState<number | null>(null);
  const jobs = useQuery({
    queryKey: ["admin-jobs", status],
    queryFn: () => get<Page<EncodeJob>>(`/admin-api/encoder/jobs${status ? `?status=${status}` : ""}`),
    refetchInterval: 3000,
  });
  const retry = useMutation({
    mutationFn: (id: number) => post(`/admin-api/encoder/jobs/${id}/retry`),
    onSuccess: () => { toast("Queued again"); qc.invalidateQueries({ queryKey: ["admin-jobs"] }); },
    onError: (e: Error) => toast(e.message, "bad"),
  });

  return (
    <div>
      <PageHeader title="Encoder" description="The job queue lives in PostgreSQL. Stale jobs (no heartbeat for 2 minutes) are requeued automatically."
        actions={<Tabs value={status} onChange={setStatus} tabs={[{ value: "", label: "All" }, { value: "running", label: "Running" }, { value: "queued", label: "Queued" }, { value: "failed", label: "Failed" }, { value: "done", label: "Done" }]} />} />
      <Card>
        {jobs.isLoading ? <LoadingBlock /> : jobs.data?.results.length === 0 ? <p className="text-center text-[13.5px] text-ink-3 py-12">No jobs.</p> : (
          <div className="divide-y divide-line">
            {jobs.data?.results.map((j) => (
              <div key={j.id} className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <span className="text-[12px] text-ink-3 font-mono w-12">#{j.id}</span>
                  <div className="flex-1 min-w-0">
                    <Link to={`/app/videos/${j.video}`} className="text-[14px] font-medium truncate hover:text-clay block">{j.video_title}</Link>
                    <div className="text-[12.5px] text-ink-3">{j.organization} · attempt {j.attempts} · {j.status === "running" ? `heartbeat ${relative(j.heartbeat_at)} on ${j.locked_by}` : j.finished_at ? `finished ${dateTime(j.finished_at)}` : `queued ${relative(j.created_at)}`}</div>
                  </div>
                  {j.status === "running" && <div className="w-40"><ProgressBar value={j.progress} tone="clay" /><div className="text-[11.5px] text-ink-3 mt-1 tabular">{j.progress}%</div></div>}
                  <Badge tone={TONE[j.status]} className="capitalize">{j.status}</Badge>
                  {j.log_tail && <Button variant="ghost" size="sm" onClick={() => setOpenLog(openLog === j.id ? null : j.id)}>Log</Button>}
                  {j.status === "failed" && <Button variant="secondary" size="sm" icon={<RotateCw className="size-3.5" />} onClick={() => retry.mutate(j.id)}>Retry</Button>}
                </div>
                {openLog === j.id && <pre className="mt-3 rounded-2xl bg-[#1d1d1f] text-[#e8e8ea] p-4 text-[11.5px] leading-relaxed font-mono overflow-x-auto max-h-80">{j.log_tail}</pre>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
