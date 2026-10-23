export type Role = "owner" | "admin" | "uploader";
export type OrgStatus = "pending" | "trial" | "active" | "suspended";
export type VideoStatus = "uploading" | "queued" | "encoding" | "ready" | "failed";

export interface User { id: number; email: string; name: string; avatar_url: string; is_staff: boolean }
export interface Quotas { storage_gb: number; bandwidth_gb: number; max_members: number }
export interface Organization {
  id: number; name: string; slug: string; status: OrgStatus; plan: { id: number; name: string } | null;
  trial_ends_at: string | null; billing_email: string; quotas: Quotas; created_at: string;
}
export interface Membership { id: number; role: Role; organization: Organization }
export interface Me {
  user: User; memberships: Membership[];
  pending_invitations: { token: string; organization: string; role: Role }[];
}
export interface Library {
  id: number; name: string; token_auth_enabled: boolean; allowed_domains: string[]; allow_direct_access: boolean;
  default_privacy: "public" | "private"; video_count: number; storage_bytes: number; created_at: string;
}
export interface Rendition { name: string; width: number; height: number; maxrate_kbps: number }
export interface Video {
  id: string; library: number; library_name: string; title: string; privacy: "public" | "private"; status: VideoStatus;
  progress: number; duration_s: number | null; source_bytes: number; storage_bytes: number; width: number | null;
  height: number | null; renditions: Rendition[]; error: string; original_filename: string;
  urls: { embed: string; hls: string; thumbnail: string | null }; created_at: string; ready_at: string | null;
}
export interface Page<T> { count: number; num_pages: number; current_page: number; results: T[] }
export interface Plan {
  id: number; name: string; price_paisa: number; storage_gb: number; bandwidth_gb: number; max_members: number;
  overage_storage_paisa_per_gb: number; overage_bandwidth_paisa_per_tb: number; active: boolean; sort_order: number;
}
export interface Estimate {
  period: string; plan: Plan | null; storage_avg_bytes: number; bandwidth_bytes: number; requests: number;
  base_paisa: number; overage_paisa: number; total_paisa: number; cost_paisa: number;
  storage_overage_gb: number; bandwidth_overage_tb: number;
}
export interface Invoice {
  id: number; number: string; organization: number; organization_name: string; period: string;
  plan_snapshot: Partial<Plan>; storage_gb_avg: string; bandwidth_tb: string; base_paisa: number;
  overage_paisa: number; adjustment_paisa: number; total_paisa: number; status: "draft" | "sent" | "paid";
  paid_at: string | null; note: string; created_at: string;
}
export interface Member { id: number; email: string; name: string; avatar_url: string; role: Role; created_at: string }
export interface Invitation { id: number; email: string; role: Role; invited_by: string | null; expires_at: string; created_at: string }
export interface ApiKey { id: number; name: string; prefix: string; created_by: string | null; created_at: string; last_used_at: string | null }
export interface UsageSummary {
  storage_now_bytes: number; bandwidth_bytes: number; requests: number; cache_hit_ratio: number | null;
  quotas: Quotas; storage_pct: number; bandwidth_pct: number; estimate: Estimate | null;
  period: { from: string; to: string };
}
export interface UsageDay { date: string; bytes_delivered: number; requests: number; storage_bytes: number }
export interface TopVideo { video_id: string; title: string; library_id: number; bytes_delivered: number; requests: number }
export interface EncodeJob {
  id: number; video: string; video_title: string; organization: string; status: "queued" | "running" | "done" | "failed";
  progress: number; attempts: number; locked_by: string; heartbeat_at: string | null; started_at: string | null;
  finished_at: string | null; log_tail: string; created_at: string;
}
