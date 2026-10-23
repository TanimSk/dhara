const KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024;

export function bytes(n: number | null | undefined, digits = 1): string {
  if (!n) return "0 B";
  if (n >= TB) return `${(n / TB).toFixed(digits)} TB`;
  if (n >= GB) return `${(n / GB).toFixed(digits)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(digits)} MB`;
  if (n >= KB) return `${(n / KB).toFixed(0)} KB`;
  return `${n} B`;
}

export function gbLabel(gb: number): string {
  return gb >= 1024 ? `${+(gb / 1024).toFixed(1)} TB` : `${gb} GB`;
}

/** Taka with Bangladeshi digit grouping: ৳1,23,456 */
export function taka(paisa: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  const value = (paisa ?? 0) / 100;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(Math.abs(value));
  return `${value < 0 ? "−" : ""}৳${formatted}`;
}

export function duration(s: number | null | undefined): string {
  if (!s && s !== 0) return "-";
  const t = Math.round(s);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

const dhaka = { timeZone: "Asia/Dhaka" } as const;

export function date(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { ...dhaka, day: "numeric", month: "short", year: "numeric" });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-GB", { ...dhaka, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function month(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
  return date(iso);
}

export function pct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}
