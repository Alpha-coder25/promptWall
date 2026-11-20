import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  FlaskConical,
  Gauge,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { api } from "../lib/api";
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  SelectInput,
  SeverityBadge,
  Skeleton,
  Tabs,
  useToast,
} from "../components/ui";
import { cn, formatDateTime, timeAgo } from "../lib/utils";
import type { Alert } from "../types";

const TYPE_META: Record<Alert["type"], { label: string; icon: typeof Bell }> = {
  repeated_attacks: { label: "Repeated attacks", icon: ShieldAlert },
  high_risk_session: { label: "High-risk session", icon: Gauge },
  tool_activity: { label: "Tool activity", icon: Wrench },
  policy: { label: "Policy", icon: FlaskConical },
  system_health: { label: "System health", icon: BellRing },
};

type Tab = "all" | "unread";

export default function AlertsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [type, setType] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const alerts = useQuery({ queryKey: ["alerts"], queryFn: api.listAlerts });
  const markOne = useMutation({
    mutationFn: (id: string) => api.markAlertRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.markAllAlertsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast({ title: "All alerts marked read", variant: "success" });
    },
  });

  const list = useMemo(() => {
    const all = alerts.data ?? [];
    return all.filter((alert) => {
      if (tab === "unread" && alert.read) return false;
      if (type !== "all" && alert.type !== type) return false;
      return true;
    });
  }, [alerts.data, tab, type]);

  const unread = alerts.data?.filter((a) => !a.read).length ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow={<><Bell className="h-3 w-3" /> Notification center</>}
        title="Alerts"
        description="Operational signals that need attention: repeated attacks, risky sessions, held tool calls and gateway health."
        actions={
          <>
            <Button onClick={() => alerts.refetch()} disabled={alerts.isFetching}>
              Refresh
            </Button>
            <Button onClick={() => markAll.mutate()} disabled={unread === 0 || markAll.isPending}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[
            { id: "all", label: "All alerts", count: alerts.data?.length ?? 0 },
            { id: "unread", label: "Unread", count: unread },
          ]}
          value={tab}
          onChange={setTab}
          className="border-0"
        />
        <SelectInput
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Filter alerts by type"
          className="h-8 w-[210px] py-0 text-xs"
        >
          <option value="all">All alert types</option>
          {(Object.keys(TYPE_META) as Alert["type"][]).map((key) => (
            <option key={key} value={key}>
              {TYPE_META[key].label}
            </option>
          ))}
        </SelectInput>
      </div>

      <Panel>
        {alerts.isError ? (
          <ErrorState onRetry={() => alerts.refetch()} />
        ) : alerts.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title={tab === "unread" ? "No unread alerts" : "No alerts in this view"}
            description={
              tab === "unread"
                ? "You are caught up. New alerts appear when the backend records a matching condition."
                : "Alert rules depend on backend detection of repeated attacks, session risk and tool activity. Some of those signals are not implemented yet."
            }
          />
        ) : (
          <ul className="divide-y divide-line/60">
            {list.map((alert) => {
              const meta = TYPE_META[alert.type];
              const Icon = meta.icon;
              return (
                <li
                  key={alert.id}
                  className={cn("flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start", !alert.read && "bg-accent/[0.025]")}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                      alert.severity === "critical"
                        ? "border-danger/30 bg-danger/10 text-danger"
                        : alert.severity === "high"
                          ? "border-warning/30 bg-warning/10 text-warning"
                          : "border-line bg-raised text-ink-muted",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-ink">{alert.title}</p>
                      <SeverityBadge severity={alert.severity} />
                      <span className="chip text-2xs">{meta.label}</span>
                      {!alert.read ? (
                        <span className="inline-flex items-center gap-1 text-2xs text-accent">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> unread
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">{alert.description}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-2xs">
                      <span className="text-ink-faint">{formatDateTime(alert.created_at)} · {timeAgo(alert.created_at)}</span>
                      {alert.event_id ? (
                        <Link
                          to={`/events/${alert.event_id}`}
                          className="inline-flex items-center gap-0.5 text-accent/90 hover:text-accent"
                        >
                          Open event <ChevronRight className="h-2.5 w-2.5" />
                        </Link>
                      ) : null}
                      {alert.session_id ? (
                        <Link
                          to={`/sessions/${alert.session_id}`}
                          className="inline-flex items-center gap-0.5 text-accent/90 hover:text-accent"
                        >
                          Open session <ChevronRight className="h-2.5 w-2.5" />
                        </Link>
                      ) : null}
                      {!alert.read ? (
                        <button
                          type="button"
                          onClick={() => markOne.mutate(alert.id)}
                          className="text-ink-muted hover:text-ink"
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <p className="mt-3 text-2xs text-ink-faint">
        Notification delivery (email, Slack, webhooks) is not implemented. This center only reflects alert
        records returned by the API.
      </p>
    </div>
  );
}
