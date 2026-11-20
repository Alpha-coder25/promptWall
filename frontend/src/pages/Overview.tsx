import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FlaskConical,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { api, categoryLabel, IS_LIVE } from "../lib/api";
import { useWorkspace } from "../context/workspace";
import {
  Button,
  DecisionBadge,
  EmptyState,
  ErrorState,
  InfoTip,
  Panel,
  PanelHeader,
  PageHeader,
  RiskBar,
  SeverityBadge,
  Skeleton,
  StatusBadge,
  TableSkeleton,
} from "../components/ui";
import { ActivityChart, ChartLegend, DecisionDonut, ThreatBars } from "../components/charts";
import { cn, formatDateTime, formatMs, formatNumber, formatPercent, signedPercent, timeAgo, truncateMiddle } from "../lib/utils";
import { projectName, severityOf } from "../lib/mock";
import type { OverviewData } from "../types";

const RANGES = [7, 14, 30] as const;

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span className="text-2xs text-ink-faint">No prior period</span>;
  const up = current >= previous;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-2xs", up ? "text-ink-secondary" : "text-ink-secondary")}>
      <Icon className="h-3 w-3" aria-hidden />
      {signedPercent(current, previous)}
      <span className="text-ink-faint">vs previous</span>
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  definition,
  loading,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon: typeof ShieldCheck;
  tone?: "default" | "danger" | "warning" | "success";
  definition: string;
  loading?: boolean;
}) {
  return (
    <div className="panel group relative overflow-hidden p-4">
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-px",
          tone === "danger" && "bg-gradient-to-r from-transparent via-danger/40 to-transparent",
          tone === "warning" && "bg-gradient-to-r from-transparent via-warning/40 to-transparent",
          tone === "success" && "bg-gradient-to-r from-transparent via-success/30 to-transparent",
          tone === "default" && "bg-gradient-to-r from-transparent via-line-strong to-transparent",
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <p className="text-2xs font-semibold uppercase tracking-[0.09em] text-ink-muted">{label}</p>
          <InfoTip>{definition}</InfoTip>
        </div>
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "danger" && "text-danger/80",
            tone === "warning" && "text-warning/80",
            tone === "success" && "text-success/80",
            tone === "default" && "text-ink-faint",
          )}
          aria-hidden
        />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink">{value}</p>
      )}
      <div className="mt-1 min-h-[16px]">{loading ? <Skeleton className="h-3 w-24" /> : sub}</div>
    </div>
  );
}

function HealthRow({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "muted" }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-2 last:border-0">
      <span className="text-xs text-ink-muted">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 font-mono text-xs",
          tone === "ok" && "text-success",
          tone === "warn" && "text-warning",
          tone === "muted" && "text-ink-secondary",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "ok" && "bg-success",
            tone === "warn" && "bg-warning",
            tone === "muted" && "bg-ink-faint",
          )}
          aria-hidden
        />
        {value}
      </span>
    </div>
  );
}

export default function OverviewPage() {
  const { projectId, project, days, setDays, rangeLabel } = useWorkspace();
  const navigate = useNavigate();

  const overview = useQuery({
    queryKey: ["overview", projectId, days],
    queryFn: () => api.getOverview({ projectId, days }),
  });
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const approvals = useQuery({
    queryKey: ["approvals", projectId],
    queryFn: () => api.listApprovals(projectId),
  });

  const data: OverviewData | undefined = overview.data;
  const loading = overview.isLoading;
  const pending = approvals.data?.filter((a) => a.status === "pending").length ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <Sparkles className="h-3 w-3" /> Security posture
          </>
        }
        title="Overview"
        description={
          project
            ? `Detection, decisions and tool activity for ${project.name} over the ${rangeLabel.toLowerCase()}.`
            : `Aggregated detection, decisions and tool activity across all projects over the ${rangeLabel.toLowerCase()}.`
        }
        actions={
          <>
            <div className="flex items-center rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Time range">
              {RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setDays(range)}
                  aria-pressed={days === range}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs transition-colors",
                    days === range ? "bg-raised text-ink" : "text-ink-muted hover:text-ink-secondary",
                  )}
                >
                  {range}d
                </button>
              ))}
            </div>
            <Button
              onClick={() => overview.refetch()}
              disabled={overview.isFetching}
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", overview.isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="primary" onClick={() => navigate("/events")}>
              Investigate events <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </>
        }
      />

      {!IS_LIVE ? (
        <div className="mb-5 flex flex-col gap-1 rounded-md border border-warning/20 bg-warning/[0.05] px-3.5 py-2.5 text-xs text-warning/90 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Fixture data: this console is running without a gateway connection. Every number below is
            synthetic and describes the interface, not your security posture.
          </span>
          <Link to="/settings" className="shrink-0 text-warning underline underline-offset-2">
            Connect a gateway
          </Link>
        </div>
      ) : null}

      {overview.isError ? (
        <Panel>
          <ErrorState onRetry={() => overview.refetch()} />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="Total requests"
              value={loading ? "—" : formatNumber(data?.metrics.totalRequests ?? 0)}
              sub={
                data ? (
                  <Delta
                    current={data.metrics.totalRequests}
                    previous={data.metrics.previous?.totalRequests ?? 0}
                  />
                ) : null
              }
              icon={Zap}
              definition="Requests inspected by the gateway in the selected period and project."
              loading={loading}
            />
            <MetricCard
              label="Threats detected"
              value={loading ? "—" : formatNumber(data?.metrics.threats ?? 0)}
              sub={
                data ? (
                  <Delta current={data.metrics.threats} previous={data.metrics.previous?.threats ?? 0} />
                ) : null
              }
              icon={ShieldAlert}
              tone="danger"
              definition="Requests with at least one detection scoring at or above the low (0.35) threshold. Allowed-with-detection requests are included."
              loading={loading}
            />
            <MetricCard
              label="Blocked"
              value={loading ? "—" : formatNumber(data?.metrics.blocked ?? 0)}
              sub={
                data ? (
                  <span className="text-2xs text-ink-faint">
                    {data.metrics.totalRequests
                      ? formatPercent(data.metrics.blocked / data.metrics.totalRequests, 1)
                      : "0%"}{" "}
                    of requests · never forwarded
                  </span>
                ) : null
              }
              icon={ShieldCheck}
              tone="danger"
              definition="Requests where the decision engine returned block. These are not forwarded to the provider."
              loading={loading}
            />
            <MetricCard
              label="Sanitized"
              value={loading ? "—" : formatNumber(data?.metrics.sanitized ?? 0)}
              sub={<span className="text-2xs text-ink-faint">Spans replaced before forwarding</span>}
              icon={ShieldQuestion}
              tone="warning"
              definition="Requests forwarded after detected spans were replaced with the sanitize placeholder."
              loading={loading}
            />
            <MetricCard
              label="Allowed"
              value={loading ? "—" : formatNumber(data?.metrics.allowed ?? 0)}
              sub={<span className="text-2xs text-ink-faint">Forwarded unchanged</span>}
              icon={CheckCircle2}
              tone="success"
              definition="Requests forwarded without modification. Some may still contain low-scoring detections."
              loading={loading}
            />
            <MetricCard
              label="Latency"
              value={loading ? "—" : formatMs(data?.metrics.avgLatency ?? 0)}
              sub={
                <span className="text-2xs text-ink-faint">
                  p95 {data ? formatMs(data.metrics.p95Latency) : "—"} · measured
                </span>
              }
              icon={Clock3}
              definition="Measured gateway processing time (normalization, detection, decision, audit). Provider time is excluded."
              loading={loading}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <PanelHeader
                title="Request activity"
                subtitle="Inspected requests per day, split by decision"
                actions={
                  <ChartLegend
                    items={[
                      { label: "Allowed", color: "#34D399" },
                      { label: "Sanitized", color: "#FBBF24" },
                      { label: "Blocked", color: "#FB7185" },
                    ]}
                  />
                }
              />
              <div className="px-3 pb-4 pt-3">
                {loading ? (
                  <Skeleton className="h-[232px] w-full" />
                ) : data && data.metrics.totalRequests > 0 ? (
                  <ActivityChart data={data.series} />
                ) : (
                  <EmptyState
                    icon={<Zap className="h-5 w-5" />}
                    title="No requests in this period"
                    description="Once an application sends traffic through the gateway, activity appears here. No placeholder values are shown."
                  />
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Decision mix" subtitle="All inspected requests" />
              <div className="px-4 pb-4">
                {loading ? (
                  <Skeleton className="mt-3 h-[178px] w-full" />
                ) : data && data.metrics.totalRequests > 0 ? (
                  <>
                    <DecisionDonut counts={data.decisionCounts} />
                    <div className="mt-1 grid grid-cols-3 gap-2 border-t border-line pt-3">
                      {(
                        [
                          ["Allow", data.decisionCounts.allow, "text-success"],
                          ["Sanitize", data.decisionCounts.sanitize, "text-warning"],
                          ["Block", data.decisionCounts.block, "text-danger"],
                        ] as const
                      ).map(([label, value, tone]) => (
                        <div key={label}>
                          <p className={cn("font-mono text-sm", tone)}>{formatNumber(value)}</p>
                          <p className="text-2xs text-ink-faint">{label}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState title="No decisions yet" description="Decision counts need inspected traffic." />
                )}
              </div>
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <PanelHeader
                title="Recent security events"
                subtitle="Latest detections in scope"
                actions={
                  <Link to="/events" className="text-xs text-accent/90 hover:text-accent">
                    View all
                  </Link>
                }
              />
              {loading ? (
                <TableSkeleton rows={5} cols={5} />
              ) : data && data.recentEvents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Category</th>
                        <th>Channel</th>
                        <th>Risk</th>
                        <th>Decision</th>
                        <th className="text-right">Project</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentEvents.map((event) => (
                        <tr
                          key={event.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/events/${event.id}`)}
                        >
                          <td className="whitespace-nowrap font-mono text-xs text-ink-muted">
                            {formatDateTime(event.created_at)}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <SeverityBadge severity={severityOf(event.final_score)} />
                              <span className="truncate text-xs text-ink-secondary">
                                {event.detections[0] ? categoryLabel(event.detections[0].category) : "No detection"}
                              </span>
                            </div>
                          </td>
                          <td className="text-xs text-ink-muted">
                            {event.messages.find((m) => m.channel !== "system")?.channel.replace("_", " ") ??
                              "—"}
                          </td>
                          <td>
                            <RiskBar score={event.final_score} decision={event.decision} compact />
                          </td>
                          <td>
                            <DecisionBadge decision={event.decision} />
                          </td>
                          <td className="whitespace-nowrap text-right text-xs text-ink-muted">
                            {projectName(event.project_id)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="No security events"
                  description="Nothing has been inspected in this period. If you expected traffic, check the project key and base URL."
                />
              )}
            </Panel>

            <div className="flex flex-col gap-4">
              <Panel>
                <PanelHeader title="Threat distribution" subtitle="By primary detection category" />
                <div className="px-4 pb-4">
                  {loading ? (
                    <Skeleton className="mt-3 h-[178px] w-full" />
                  ) : (
                    <ThreatBars data={data?.threatCounts ?? []} />
                  )}
                </div>
              </Panel>

              <Panel>
                <PanelHeader
                  title="Gateway health"
                  subtitle="Live service checks"
                  actions={
                    <span className="flex items-center gap-1.5 text-2xs text-ink-muted">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                      </span>
                      polling
                    </span>
                  }
                />
                <div className="px-4 py-2">
                  <HealthRow
                    label="API process"
                    value={health.isLoading ? "checking" : health.isError ? "unreachable" : "healthy"}
                    tone={health.isLoading ? "muted" : health.isError ? "warn" : "ok"}
                  />
                  <HealthRow
                    label="Audit database"
                    value={health.data?.db ?? (health.isError ? "unknown" : "—")}
                    tone={health.data?.db === "connected" ? "ok" : "warn"}
                  />
                  <HealthRow
                    label="Uninspected (fail-open)"
                    value={loading ? "—" : formatNumber(data?.uninspected ?? 0)}
                    tone={(data?.uninspected ?? 0) > 0 ? "warn" : "ok"}
                  />
                  <HealthRow
                    label="Inspection status"
                    value={health.data?.version ?? "—"}
                    tone="muted"
                  />
                </div>
              </Panel>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <PanelHeader
                title="High-risk sessions"
                subtitle="Accumulated session risk, highest first"
                actions={
                  <Link to="/sessions" className="text-xs text-accent/90 hover:text-accent">
                    All sessions
                  </Link>
                }
              />
              {loading ? (
                <TableSkeleton rows={4} cols={5} />
              ) : data && data.highRiskSessions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Project</th>
                        <th>Requests</th>
                        <th>Last activity</th>
                        <th>Risk</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.highRiskSessions.map((session) => (
                        <tr
                          key={session.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/sessions/${session.id}`)}
                        >
                          <td className="font-mono text-xs text-accent/90">{truncateMiddle(session.id, 8, 6)}</td>
                          <td className="text-xs">{projectName(session.project_id)}</td>
                          <td className="font-mono text-xs text-ink-muted">{session.request_count}</td>
                          <td className="whitespace-nowrap text-xs text-ink-muted">
                            {timeAgo(session.last_activity)}
                          </td>
                          <td>
                            <RiskBar score={session.risk_score} compact />
                          </td>
                          <td>
                            <StatusBadge value={session.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="No high-risk sessions"
                  description="No session crossed the watch threshold in this period."
                />
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Quick actions" subtitle="Common security operations" />
              <div className="divide-y divide-line/60">
                {[
                  {
                    to: "/approvals",
                    icon: ShieldCheck,
                    label: "Review tool approvals",
                    meta: pending > 0 ? `${pending} pending` : "nothing pending",
                  },
                  {
                    to: "/demo",
                    icon: FlaskConical,
                    label: "Open document assistant",
                    meta: "live demo",
                  },
                  {
                    to: "/policies",
                    icon: ShieldAlert,
                    label: "Adjust project policy",
                    meta: project ? `v${project.active_policy_version} active` : "select a project",
                  },
                  {
                    to: "/keys",
                    icon: KeyRound,
                    label: "Manage API keys",
                    meta: "issue / revoke",
                  },
                ].map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/60"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded border border-line bg-raised text-ink-muted group-hover:text-accent">
                      <action.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-ink-secondary">{action.label}</span>
                      <span className="block text-2xs text-ink-faint">{action.meta}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-ink-faint group-hover:text-ink-muted" />
                  </Link>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
