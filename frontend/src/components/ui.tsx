import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Info,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  X,
  XCircle,
} from "lucide-react";
import type { Channel, Decision, Severity } from "../types";
import { cn, formatNumber } from "../lib/utils";
import { CHANNEL_LABEL } from "../lib/mock";

/* --------------------------------------------------------------- toasts */

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ title, description, variant = "info" }) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current, { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[340px] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-slide-in items-start gap-3 rounded-lg border border-line-strong bg-raised px-4 py-3 shadow-pop"
          >
            <span className="mt-0.5">
              {t.variant === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
              ) : t.variant === "error" ? (
                <XCircle className="h-4 w-4 text-danger" aria-hidden />
              ) : (
                <Info className="h-4 w-4 text-accent" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.description ? <p className="mt-0.5 text-xs text-ink-muted">{t.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-ink-faint transition-colors hover:text-ink"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

/* -------------------------------------------------------------- buttons */

type ButtonVariant = "default" | "primary" | "danger" | "ghost";

export function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cn(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "danger" && "btn-danger",
        variant === "ghost" && "btn-ghost",
        size === "sm" && "btn-sm",
        className,
      )}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- panels */

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("panel", className)}>{children}</section>;
}

export function PanelHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("panel-header", className)}>
      <div className="min-w-0">
        <h2 className="panel-title">{title}</h2>
        {subtitle ? <p className="panel-sub mt-0.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.12em] text-accent/80">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- badges */

const decisionStyles: Record<Decision, { className: string; icon: typeof ShieldCheck; label: string }> = {
  allow: {
    className: "border-success/25 bg-success/10 text-success",
    icon: ShieldCheck,
    label: "Allow",
  },
  sanitize: {
    className: "border-warning/25 bg-warning/10 text-warning",
    icon: ShieldQuestion,
    label: "Sanitize",
  },
  block: {
    className: "border-danger/30 bg-danger/10 text-danger",
    icon: ShieldAlert,
    label: "Block",
  },
};

export function DecisionBadge({ decision, className }: { decision: Decision; className?: string }) {
  const style = decisionStyles[decision];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium capitalize",
        style.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {style.label}
    </span>
  );
}

const severityStyles: Record<Severity, string> = {
  low: "border-line-strong bg-raised text-ink-muted",
  medium: "border-info/30 bg-info/10 text-info",
  high: "border-warning/30 bg-warning/10 text-warning",
  critical: "border-danger/35 bg-danger/10 text-danger",
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium capitalize",
        severityStyles[severity],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          severity === "low" && "bg-ink-muted",
          severity === "medium" && "bg-info",
          severity === "high" && "bg-warning",
          severity === "critical" && "bg-danger",
        )}
        aria-hidden
      />
      {severity}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  const external = channel === "retrieved_document" || channel === "tool_output";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-medium",
        external
          ? "border-warning/25 bg-warning/[0.07] text-warning/90"
          : "border-line bg-raised text-ink-muted",
      )}
    >
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

const statusStyles: Record<string, string> = {
  normal: "border-line-strong bg-raised text-ink-muted",
  watched: "border-warning/30 bg-warning/10 text-warning",
  quarantined: "border-danger/30 bg-danger/10 text-danger",
  pending: "border-warning/30 bg-warning/10 text-warning",
  approved: "border-success/25 bg-success/10 text-success",
  rejected: "border-danger/30 bg-danger/10 text-danger",
  expired: "border-line-strong bg-raised text-ink-muted",
  inspected: "border-success/20 bg-success/[0.07] text-success/90",
  uninspected: "border-danger/25 bg-danger/[0.07] text-danger/90",
  connected: "border-success/25 bg-success/10 text-success",
  active: "border-success/25 bg-success/10 text-success",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium capitalize",
        statusStyles[value] ?? "border-line bg-raised text-ink-muted",
        className,
      )}
    >
      {value}
    </span>
  );
}

/* ---------------------------------------------------------------- score */

export function riskTone(score: number, decision?: Decision): string {
  if (decision === "block") return "text-danger";
  if (score >= 0.8) return "text-danger";
  if (score >= 0.55) return "text-warning";
  if (score >= 0.35) return "text-info";
  return "text-success";
}

export function RiskBar({
  score,
  decision,
  compact = false,
}: {
  score: number;
  decision?: Decision;
  compact?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, score * 100));
  const tone =
    decision === "block" || score >= 0.8
      ? "bg-danger"
      : score >= 0.55
        ? "bg-warning"
        : score >= 0.35
          ? "bg-info"
          : "bg-success";
  return (
    <div className={cn("flex items-center gap-2", compact ? "w-28" : "w-full")}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-valuenow={Number(score.toFixed(2))}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-label="Risk score"
      >
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("font-mono text-xs tabular-nums", riskTone(score, decision))}>
        {score.toFixed(2)}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- fields */

export function Field({
  label,
  hint,
  children,
  htmlFor,
  error,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-danger" role="alert">
          <CircleAlert className="h-3 w-3" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("input", props.className)} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn("select", props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("input min-h-24 resize-y", props.className)} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        checked ? "border-accent/40 bg-accent/25" : "border-line-strong bg-raised",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full transition-transform",
          checked ? "translate-x-[18px] bg-accent" : "translate-x-[2px] bg-ink-faint",
        )}
      />
    </button>
  );
}

/* ----------------------------------------------------------------- tabs */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 border-b border-line", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            value === tab.id
              ? "border-accent text-ink"
              : "border-transparent text-ink-muted hover:text-ink-secondary",
          )}
        >
          {tab.label}
          {tab.count !== undefined ? (
            <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-2xs text-ink-muted">
              {formatNumber(tab.count)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full animate-slide-in rounded-lg border border-line-strong bg-surface shadow-pop",
          width === "sm" && "max-w-md",
          width === "md" && "max-w-lg",
          width === "lg" && "max-w-3xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-faint transition-colors hover:bg-raised hover:text-ink"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children ? <div className="px-5 py-4">{children}</div> : null}
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-line bg-overlay/50 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------------------------------------- drawer */

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[65]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Details"}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full animate-drawer-in flex-col border-l border-line-strong bg-surface shadow-pop",
          width === "md" ? "max-w-xl" : "max-w-3xl",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="min-w-0 text-sm font-semibold text-ink">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-faint hover:bg-raised hover:text-ink"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------ states */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-raised", className)} />;
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-px" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn("h-3.5", c === 1 ? "w-40" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-raised text-ink-muted">
        {icon ?? <ShieldQuestion className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Could not load this data",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-danger/25 bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-ink-muted">
        {description ?? "The request failed. No partial or estimated numbers are shown."}
      </p>
      {onRetry ? (
        <Button className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/[0.07] px-3 py-2 text-xs text-danger">
      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function LoadingLine({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {label}
    </span>
  );
}

/* ------------------------------------------------------------ pagination */

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p className="text-xs text-ink-muted">
        Showing <span className="font-mono text-ink-secondary">{first}</span>–
        <span className="font-mono text-ink-secondary">{last}</span> of{" "}
        <span className="font-mono text-ink-secondary">{formatNumber(total)}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <span className="px-2 font-mono text-xs text-ink-muted">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- code/ids */

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Copied to clipboard", variant: "success" });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: "Clipboard unavailable", description: "Select the value and copy it manually.", variant: "error" });
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded border border-line bg-raised px-1.5 py-1 text-2xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      aria-label={`${label} value`}
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function CodeBlock({
  code,
  language,
  maxHeight = "none",
  copyable = true,
}: {
  code: string;
  language?: string;
  maxHeight?: string;
  copyable?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-[#080d16]">
      <div className="flex items-center justify-between border-b border-line/70 px-3 py-1.5">
        <span className="text-2xs uppercase tracking-wider text-ink-faint">{language ?? "text"}</span>
        {copyable ? <CopyButton value={code} /> : null}
      </div>
      <pre
        className="overflow-auto p-3 font-mono text-xs leading-relaxed text-ink-secondary"
        style={{ maxHeight }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function KeyValue({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs text-ink-muted">{label}</dt>
      <dd className={cn("min-w-0 text-right text-xs text-ink-secondary", mono && "font-mono")}>{children}</dd>
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h3 className="text-2xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
        {children}
        {hint ? <span className="ml-2 normal-case tracking-normal text-ink-faint">{hint}</span> : null}
      </h3>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- misc */

export function InfoTip({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex cursor-help items-center text-ink-faint hover:text-ink-muted"
      title={typeof children === "string" ? children : undefined}
    >
      <Info className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink">
      <ChevronLeft className="h-3.5 w-3.5" /> {children}
    </Link>
  );
}

export function UnsupportedNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/[0.06] px-3 py-2 text-xs leading-relaxed text-warning/90">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
