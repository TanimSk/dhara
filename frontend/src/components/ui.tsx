import { clsx } from "clsx";
import { Check, Copy, Loader2, X } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

export const cx = clsx;

// ---------- Logo ----------

export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" style={{ fill: "var(--color-ink)" }} />
      <path d="M7 18.5c3-4.4 6-4.4 9 0s6 4.4 9 0" style={{ stroke: "var(--color-canvas)" }} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M7 12.5c3-4.4 6-4.4 9 0s6 4.4 9 0" stroke="#d97757" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[19px] font-semibold tracking-[-0.03em]">dhara</span>
    </span>
  );
}

// ---------- Button ----------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "clay";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-canvas hover:opacity-90 shadow-soft disabled:bg-ink-4",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-sunken shadow-soft disabled:text-ink-4",
  ghost: "text-ink-2 hover:text-ink hover:bg-sunken disabled:text-ink-4",
  danger: "bg-surface text-bad border border-line hover:border-bad/40 hover:bg-bad-soft shadow-soft",
  clay: "bg-clay text-white hover:bg-[#b5573a] shadow-soft",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-full",
  md: "h-10 px-4 text-[14px] gap-2 rounded-full",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-full",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98] select-none",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ---------- Card ----------

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("bg-surface border border-line rounded-3xl shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        {description && <p className="mt-1 text-[13px] text-ink-3 leading-relaxed">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------- Page header ----------

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8 animate-fade-up">
      <div className="min-w-0">
        {eyebrow && <div className="text-[12px] font-medium text-ink-3 mb-1.5">{eyebrow}</div>}
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em]">{title}</h1>
        {description && <p className="mt-1.5 text-[14px] text-ink-3 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Form controls ----------

const field =
  "w-full rounded-xl bg-surface border border-line px-3.5 text-[14px] text-ink placeholder:text-ink-4 transition-colors " +
  "hover:border-line-strong focus:border-ink focus:outline-none focus:ring-4 focus:ring-ink/5 disabled:bg-sunken disabled:text-ink-3";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(field, "h-10", className)} {...rest} />;
});

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(field, "py-2.5 min-h-24", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        field,
        "h-10 appearance-none pr-9 bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8a8f' stroke-width='2.5' stroke-linecap='round'><path d='m6 9 6 6 6-6'/></svg>\")] bg-no-repeat bg-[right_12px_center]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="block text-[13px] font-medium text-ink mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-ink-3 mt-1.5 leading-relaxed">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-ok" : "bg-line-strong",
        disabled && "opacity-50",
      )}
    >
      <span
        className={cx(
          "absolute top-[3px] left-[3px] size-5 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-200",
          checked && "translate-x-[18px]",
        )}
      />
    </button>
  );
}

export function SettingRow({ title, description, control }: { title: ReactNode; description?: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-t border-line first:border-t-0">
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{title}</div>
        {description && <div className="text-[13px] text-ink-3 mt-1 leading-relaxed max-w-xl">{description}</div>}
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

// ---------- Badge ----------

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "clay";
const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  clay: "bg-clay-soft text-clay",
};

export function Badge({ tone = "neutral", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

// ---------- Progress ----------

export function ProgressBar({ value, tone = "ink", className }: { value: number; tone?: "ink" | "clay" | "ok" | "warn" | "bad"; className?: string }) {
  const colors = { ink: "bg-ink", clay: "bg-clay", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" };
  return (
    <div className={cx("h-1.5 w-full rounded-full bg-sunken overflow-hidden", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500 ease-out", colors[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return <Loader2 className={cx("animate-spin text-ink-3", className)} />;
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner />
    </div>
  );
}

// ---------- Empty state ----------

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6 animate-fade-up">
      {icon && <div className="size-14 rounded-2xl bg-sunken flex items-center justify-center text-ink-3 mb-5">{icon}</div>}
      <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
      {description && <p className="mt-1.5 text-[14px] text-ink-3 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ---------- Copy ----------

export function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, []);
  return { copied, copy };
}

export function CopyButton({ text, label = "Copy", size = "sm" }: { text: string; label?: string; size?: ButtonSize }) {
  const { copied, copy } = useCopy();
  return (
    <Button variant="secondary" size={size} onClick={() => copy(text)} icon={copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}>
      {copied ? "Copied" : label}
    </Button>
  );
}

export function CopyField({ value, label, mono = true, secret }: { value: string; label?: string; mono?: boolean; secret?: boolean }) {
  const { copied, copy } = useCopy();
  const [shown, setShown] = useState(!secret);
  return (
    <div>
      {label && <div className="text-[13px] font-medium mb-1.5">{label}</div>}
      <div className="flex items-center gap-2 rounded-xl border border-line bg-sunken/60 pl-3.5 pr-1.5 h-11">
        <code className={cx("flex-1 truncate text-[13px] text-ink-2", mono && "font-mono")}>{shown ? value : "•".repeat(Math.min(40, value.length))}</code>
        {secret && (
          <Button variant="ghost" size="sm" onClick={() => setShown((s) => !s)}>
            {shown ? "Hide" : "Reveal"}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => copy(value)} icon={copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="relative rounded-2xl bg-[#1d1d1f] text-[#e8e8ea] overflow-hidden">
      <div className="flex items-center justify-between px-4 h-10 border-b border-white/8">
        <span className="text-[12px] text-white/50 font-medium">{language}</span>
        <button onClick={() => copy(code)} className="text-[12px] text-white/60 hover:text-white flex items-center gap-1.5">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-[12.5px] leading-relaxed font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ---------- Tabs ----------

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex p-1 rounded-full bg-sunken border border-line/60">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            "h-8 px-4 rounded-full text-[13px] font-medium transition-all",
            value === t.value ? "bg-surface text-ink shadow-soft" : "text-ink-3 hover:text-ink",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, description, children, footer, width = "max-w-lg" }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-[#1d1d1f]/25 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className={cx("relative w-full bg-surface rounded-t-3xl sm:rounded-3xl shadow-float border border-line animate-fade-up max-h-[90vh] overflow-y-auto", width)}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.015em]">{title}</h2>
            {description && <p className="text-[13.5px] text-ink-3 mt-1 leading-relaxed">{description}</p>}
          </div>
          <button onClick={onClose} className="size-8 -mr-2 -mt-1 rounded-full flex items-center justify-center text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        {children && <div className="px-6 py-5">{children}</div>}
        {footer && <div className="flex justify-end gap-2 px-6 pb-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, description, confirmLabel = "Delete", loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; description?: ReactNode; confirmLabel?: string; loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" className="!bg-bad hover:!bg-[#a92f25]" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    />
  );
}

// ---------- Toasts ----------

type ToastItem = { id: number; message: string; tone: "ok" | "bad" };
const ToastContext = createContext<(message: string, tone?: "ok" | "bad") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none w-[calc(100%-32px)] sm:w-auto">
          {items.map((t) => (
            <div key={t.id} className="pointer-events-auto animate-fade-up flex items-center gap-2.5 rounded-full bg-[#1d1d1f]/92 backdrop-blur-xl text-white text-[13.5px] font-medium pl-3 pr-4 h-10 shadow-float">
              <span className={cx("size-5 rounded-full flex items-center justify-center", t.tone === "ok" ? "bg-ok" : "bg-bad")}>
                {t.tone === "ok" ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
              </span>
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------- Stat ----------

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[12.5px] font-medium text-ink-3">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold tracking-[-0.03em] tabular leading-none">{value}</div>
      {sub && <div className="mt-2 text-[12.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Avatar({ name, src, size = 32 }: { name: string; src?: string; size?: number }) {
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  if (src) return <img src={src} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover border border-line" style={{ width: size, height: size }} />;
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-sunken border border-line text-ink-2 font-semibold" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials || "?"}
    </span>
  );
}
