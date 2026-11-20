import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  ChevronDown,
  ExternalLink,
  FlaskConical,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  Menu,
  MessageSquareCode,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, IS_LIVE } from "../lib/api";
import { cn, timeAgo } from "../lib/utils";
import { useWorkspace } from "../context/workspace";
import type { Alert } from "../types";

const NAV_GROUPS: {
  label: string;
  items: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }[];
}[] = [
  {
    label: "Monitor",
    items: [
      { to: "/overview", label: "Overview", icon: LayoutDashboard },
      { to: "/events", label: "Security Events", icon: ShieldAlert },
      { to: "/sessions", label: "Sessions", icon: MessagesSquare },
      { to: "/approvals", label: "Tool Approvals", icon: ShieldCheck },
    ],
  },
  {
    label: "Configure",
    items: [
      { to: "/policies", label: "Policies", icon: SlidersHorizontal },
      { to: "/projects", label: "Projects", icon: FolderKanban },
      { to: "/keys", label: "API Keys", icon: KeyRound },
    ],
  },
  {
    label: "Measure",
    items: [{ to: "/evaluation", label: "Evaluation", icon: FlaskConical }],
  },
  {
    label: "System",
    items: [
      { to: "/alerts", label: "Alerts", icon: Bell },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/10">
        <ShieldCheck className="h-5 w-5 text-accent" strokeWidth={1.8} />
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
      </div>
      {!collapsed ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-ink">PromptWall</p>
          <p className="truncate text-2xs uppercase tracking-[0.14em] text-ink-faint">Security console</p>
        </div>
      ) : null}
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  collapsed,
  badge,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  collapsed: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-accent/[0.08] text-ink"
            : "text-ink-muted hover:bg-raised hover:text-ink-secondary",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden />
          ) : null}
          <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-accent" : "text-ink-faint group-hover:text-ink-muted")} strokeWidth={1.8} />
          {!collapsed ? (
            <>
              <span className="flex-1 truncate">{label}</span>
              {badge !== undefined && badge > 0 ? (
                <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-2xs text-ink-secondary">
                  {badge}
                </span>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const { projectId } = useWorkspace();
  const approvals = useQuery({
    queryKey: ["approvals", projectId],
    queryFn: () => api.listApprovals(projectId),
  });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: api.listAlerts });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 60_000 });

  const pending = approvals.data?.filter((a) => a.status === "pending").length ?? 0;
  const unread = alerts.data?.filter((a) => !a.read).length ?? 0;
  const healthy = health.data?.status === "ok";

  return (
    <>
      <Logo collapsed={collapsed} />
      <nav className="flex-1 overflow-y-auto px-2.5 py-4" aria-label="Primary">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed ? (
              <p className="mb-1.5 px-2 text-2xs font-semibold uppercase tracking-[0.13em] text-ink-faint">
                {group.label}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  badge={item.to === "/approvals" ? pending : item.to === "/alerts" ? unread : undefined}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="mb-2 h-px bg-line/70" />
        <NavLink
          to="/demo"
          onClick={onNavigate}
          title={collapsed ? "Secure Document Assistant" : undefined}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md border border-dashed px-2.5 py-2 text-sm transition-colors",
              collapsed && "justify-center px-0",
              isActive
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink-secondary",
            )
          }
        >
          <MessageSquareCode className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          {!collapsed ? (
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="truncate">Document Assistant</span>
              <span className="rounded bg-accent/10 px-1 py-0.5 text-2xs uppercase tracking-wider text-accent/80">
                demo
              </span>
            </span>
          ) : null}
        </NavLink>
      </nav>

      <div className="border-t border-line px-3 py-3">
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              healthy ? "bg-success shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-warning",
            )}
            aria-hidden
          />
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-ink-secondary">
                {health.isLoading ? "Checking gateway…" : healthy ? "Gateway healthy" : "Gateway degraded"}
              </p>
              <p className="truncate font-mono text-2xs text-ink-faint">
                {IS_LIVE ? "live API" : "fixture mode"} · v0.1.0
              </p>
            </div>
          ) : null}
          {onToggle && !collapsed ? (
            <button
              type="button"
              onClick={onToggle}
              className="rounded p-1 text-ink-faint hover:bg-raised hover:text-ink"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {!collapsed && !IS_LIVE ? (
          <div className="mt-2 rounded border border-warning/20 bg-warning/[0.06] px-2 py-1.5 text-2xs leading-snug text-warning/80">
            Fixture data — not live security telemetry.
          </div>
        ) : null}
      </div>
    </>
  );
}

function ProjectSelector() {
  const { projectId, setProjectId, projects, projectsLoading } = useWorkspace();
  return (
    <label className="relative flex min-w-0 items-center">
      <span className="sr-only">Selected project</span>
      <span className="pointer-events-none absolute left-2.5 z-10 hidden text-ink-faint sm:block">
        <FolderKanban className="h-3.5 w-3.5" />
      </span>
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        disabled={projectsLoading}
        className="select h-8 w-[150px] truncate border-line bg-raised py-0 pl-7 text-xs sm:w-[210px]"
      >
        <option value="all">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: api.listAlerts });
  const unread = alerts.data?.filter((a) => !a.read) ?? [];

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md border border-line bg-raised text-ink-muted transition-colors hover:text-ink"
        aria-label={`Notifications (${unread.length} unread)`}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unread.length > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-base bg-danger px-1 font-mono text-[9px] font-semibold text-white">
            {unread.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-10 z-50 w-[360px] animate-slide-in overflow-hidden rounded-lg border border-line-strong bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Unread alerts</p>
            <span className="font-mono text-2xs text-ink-faint">{unread.length}</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {unread.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-muted">No unread alerts.</p>
            ) : (
              unread.slice(0, 6).map((alert: Alert) => (
                <NavLink
                  key={alert.id}
                  to="/alerts"
                  onClick={() => setOpen(false)}
                  className="block border-b border-line/60 px-4 py-2.5 transition-colors last:border-0 hover:bg-raised"
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        alert.severity === "critical" || alert.severity === "high"
                          ? "text-danger"
                          : "text-warning",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink">{alert.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-2xs text-ink-muted">{alert.description}</p>
                      <p className="mt-1 text-2xs text-ink-faint">{timeAgo(alert.created_at)}</p>
                    </div>
                  </div>
                </NavLink>
              ))
            )}
          </div>
          <NavLink
            to="/alerts"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-2.5 text-center text-xs text-accent/90 hover:bg-raised"
          >
            View all alerts
          </NavLink>
        </div>
      ) : null}
    </div>
  );
}

function TopBar({ onMenu, onToggleSidebar }: { onMenu: () => void; onToggleSidebar: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-base/85 px-4 backdrop-blur-md md:px-6">
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-raised text-ink-muted lg:hidden"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="hidden h-8 w-8 items-center justify-center rounded-md text-ink-faint hover:bg-raised hover:text-ink lg:flex"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        <PanelLeftOpen className="h-4 w-4" />
      </button>

      <ProjectSelector />

      <form
        className="relative ml-auto hidden min-w-0 flex-1 max-w-sm items-center md:flex"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/events?q=${encodeURIComponent(query.trim())}`);
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-faint" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search request, event or session ID"
          aria-label="Search security events"
          className="input h-8 py-0 pl-8 pr-10 text-xs"
        />
        <span className="pointer-events-none absolute right-2 hidden rounded border border-line bg-raised px-1 font-mono text-[9px] text-ink-faint lg:block">
          /
        </span>
      </form>

      <div className="ml-auto flex items-center gap-2 md:ml-0">
        <span
          className={cn(
            "hidden items-center gap-1.5 rounded border px-2 py-1 text-2xs font-medium sm:flex",
            IS_LIVE
              ? "border-success/25 bg-success/[0.07] text-success"
              : "border-warning/25 bg-warning/[0.07] text-warning",
          )}
          title={
            IS_LIVE
              ? "Connected to VITE_API_BASE_URL"
              : "No backend configured. All data is fixture data generated in the browser."
          }
        >
          <Activity className="h-3 w-3" />
          {IS_LIVE ? "Live gateway" : "Fixture data"}
        </span>
        <a
          href="https://github.com/Alpha-coder25/promptWall"
          target="_blank"
          rel="noreferrer"
          className="hidden h-8 w-8 items-center justify-center rounded-md border border-line bg-raised text-ink-muted hover:text-ink sm:flex"
          aria-label="Project repository"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <NotificationMenu />
        <div className="flex h-8 items-center gap-2 rounded-md border border-line bg-raised px-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-accent/15 font-mono text-[9px] font-semibold text-accent">
            AD
          </span>
          <span className="hidden text-xs text-ink-secondary lg:block">admin</span>
          <ChevronDown className="hidden h-3 w-3 text-ink-faint lg:block" />
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden flex-col border-r border-line bg-surface/95 backdrop-blur lg:flex",
          collapsed ? "w-[68px]" : "w-[236px]",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed(true)} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/65" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] animate-drawer-in flex-col border-r border-line-strong bg-surface shadow-pop">
            <button
              type="button"
              className="absolute right-2 top-2 z-10 rounded p-1 text-ink-faint hover:text-ink"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-[68px]" : "lg:pl-[236px]")}>
        <TopBar onMenu={() => setMobileOpen(true)} onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-7">{children}</main>
        <footer className="mx-auto flex max-w-[1440px] flex-col gap-1 px-4 pb-8 pt-2 text-2xs text-ink-faint md:flex-row md:items-center md:justify-between md:px-6">
          <p>
            PromptWall is a defense-in-depth layer. It reduces risk; it cannot eliminate prompt
            injection.
          </p>
          <p className="font-mono">
            {IS_LIVE ? "connected" : "fixture environment"} · console 0.1.0
          </p>
        </footer>
      </div>
    </div>
  );
}
