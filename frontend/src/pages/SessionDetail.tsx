import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Clock3,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Wrench,
} from "lucide-react";
import { api, categoryLabel } from "../lib/api";
import {
  BackLink,
  Button,
  ChannelBadge,
  DecisionBadge,
  EmptyState,
  ErrorState,
  KeyValue,
  Panel,
  PanelHeader,
  RiskBar,
  SeverityBadge,
  Skeleton,
  StatusBadge,
  riskTone,
} from "../components/ui";
import { SessionRiskChart } from "../components/charts";
import { cn, formatDateTime, formatNumber, timeAgo, truncateMiddle } from "../lib/utils";
import { CHANNEL_LABEL, projectName, severityOf } from "../lib/mock";
import type { Channel } from "../types";

export default function SessionDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const session = useQuery({ queryKey: ["session", id], queryFn: () => api.getSession(id) });
  const events = useQuery({ queryKey: ["session-events", id], queryFn: () => api.sessionEvents(id) });
  const approvals = useQuery({ queryKey: ["approvals", "all"], queryFn: () => api.listApprovals("all") });

  if (session.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-96 xl:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (session.isError) {
    return (
      <Panel>
        <ErrorState onRetry={() => session.refetch()} />
      </Panel>
    );
  }

  const data = session.data;
  if (!data) {
    return (
      <Panel>
        <EmptyState
          title="Session not found"
          description="The session may be outside the retention window."
          action={<Button onClick={() => navigate("/sessions")}>Back to sessions</Button>}
        />
      </Panel>
    );
  }

  const timeline = events.data ?? [];
  const blocked = timeline.filter((e) => e.decision === "block").length;
  const sanitized = timeline.filter((e) => e.decision === "sanitize").length;
  const sessionApprovals = (approvals.data ?? []).filter((a) => a.session_id === data.id);
  const channels = Object.entries(data.channel_counts) as [Channel, number][];
  const maxChannel = Math.max(...channels.map(([, value]) => value), 1);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <BackLink to="/sessions">Sessions</BackLink>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => navigate(`/events?q=${data.id}`)}>
            Filter events <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <StatusBadge value={data.status} />
            <span className="text-xs text-ink-muted">{projectName(data.project_id)}</span>
          </div>
          <h1 className="font-mono text-xl font-semibold tracking-tight text-ink">{data.id}</h1>
          <p className="mt-1 text-xs text-ink-muted">
            Started {formatDateTime(data.started_at)} · last activity {timeAgo(data.last_activity)}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <p className="text-2xs uppercase tracking-wider text-ink-faint">Accumulated risk</p>
            <p className={cn("font-mono text-2xl font-semibold", riskTone(data.risk_score))}>
              {data.risk_score.toFixed(2)}
            </p>
          </div>
          <div className="w-40">
            <RiskBar score={data.risk_score} />
            <p className="mt-1 text-2xs text-ink-faint">
              {data.status === "quarantined"
                ? "Quarantine threshold crossed"
                : data.status === "watched"
                  ? "Watch threshold crossed"
                  : "Below watch threshold"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Requests", value: formatNumber(data.request_count), icon: Activity, tone: "text-ink" },
          { label: "Blocked in session", value: String(blocked), icon: ShieldAlert, tone: "text-danger" },
          { label: "Sanitized in session", value: String(sanitized), icon: ShieldQuestion, tone: "text-warning" },
          { label: "Tool approvals", value: String(sessionApprovals.length), icon: Wrench, tone: "text-ink" },
        ].map((stat) => (
          <div key={stat.label} className="panel p-4">
            <div className="flex items-center justify-between">
              <p className="text-2xs uppercase tracking-[0.08em] text-ink-muted">{stat.label}</p>
              <stat.icon className="h-3.5 w-3.5 text-ink-faint" />
            </div>
            <p className={cn("mt-2 font-mono text-xl font-semibold", stat.tone)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {blocked >= 2 ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-danger/25 bg-danger/[0.06] px-3.5 py-2.5 text-xs text-danger/90">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Repeated attack pattern: {blocked} blocked requests in this session. Review the earlier
            attempts before deciding whether to quarantine the conversation.
          </span>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel>
            <PanelHeader
              title="Request timeline"
              subtitle="Chronological, oldest first"
              actions={<span className="text-2xs text-ink-faint">{timeline.length} events</span>}
            />
            {events.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : timeline.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-5 w-5" />}
                title="No events recorded for this session"
                description="The session exists in the fixture set but has no audited requests."
              />
            ) : (
              <ol className="px-5 py-4">
                {timeline.map((event, index) => (
                  <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < timeline.length - 1 ? (
                      <span className="absolute left-[5px] top-3 h-full w-px bg-line" aria-hidden />
                    ) : null}
                    <span
                      className={cn(
                        "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-surface",
                        event.decision === "block"
                          ? "bg-danger"
                          : event.decision === "sanitize"
                            ? "bg-warning"
                            : "bg-success",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 rounded-md border border-line/70 bg-overlay/30 px-3 py-2.5 transition-colors hover:border-line-strong">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-2xs text-ink-faint">
                          {new Date(event.created_at).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                        <DecisionBadge decision={event.decision} />
                        <SeverityBadge severity={severityOf(event.final_score)} />
                        <ChannelBadge
                          channel={event.messages.find((m) => m.channel !== "system")?.channel ?? "user"}
                        />
                        <span className="ml-auto font-mono text-2xs text-ink-muted">
                          {event.final_score.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-ink-secondary">
                        {event.detections[0] ? categoryLabel(event.detections[0].category) : "No detection"}
                      </p>
                      <Link
                        to={`/events/${event.id}`}
                        className="mt-1 inline-flex items-center gap-1 text-2xs text-accent/90 hover:text-accent"
                      >
                        Inspect event <ArrowRight className="h-2.5 w-2.5" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Risk over time" subtitle="Final score per request in this session" />
            <div className="px-4 pb-4 pt-2">
              {events.isLoading ? (
                <Skeleton className="h-[190px] w-full" />
              ) : (
                <SessionRiskChart events={timeline} />
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Session summary" />
            <div className="px-4 py-3">
              <dl>
                <KeyValue label="Session" mono>
                  <span title={data.id}>{truncateMiddle(data.id, 10, 6)}</span>
                </KeyValue>
                <KeyValue label="Project">{projectName(data.project_id)}</KeyValue>
                <KeyValue label="Started">{formatDateTime(data.started_at)}</KeyValue>
                <KeyValue label="Last activity">{formatDateTime(data.last_activity)}</KeyValue>
                <KeyValue label="Requests">{formatNumber(data.request_count)}</KeyValue>
                <KeyValue label="Status">
                  <StatusBadge value={data.status} />
                </KeyValue>
              </dl>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Channel distribution" subtitle="Messages seen in this session" />
            <div className="space-y-2.5 px-4 py-4">
              {channels.map(([channel, value]) => (
                <div key={channel}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <MessageSquare className="h-3 w-3 text-ink-faint" />
                      {CHANNEL_LABEL[channel]}
                    </span>
                    <span className="font-mono text-2xs text-ink-secondary">{value}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        channel === "retrieved_document" || channel === "tool_output"
                          ? "bg-warning/70"
                          : "bg-accent/60",
                      )}
                      style={{ width: `${(value / maxChannel) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-2xs leading-relaxed text-ink-faint">
                Retrieved documents and tool outputs are untrusted channels and carry a lower decision
                threshold.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Tool approvals"
              subtitle="Calls bound to this session"
              actions={
                <Link to="/approvals" className="text-2xs text-accent/90">
                  Queue
                </Link>
              }
            />
            {sessionApprovals.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-faint">
                No tool calls recorded for this session.
              </p>
            ) : (
              <ul className="divide-y divide-line/60">
                {sessionApprovals.map((approval) => (
                  <li key={approval.id} className="flex items-center gap-2 px-4 py-2.5">
                    <Wrench className="h-3 w-3 text-ink-faint" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-secondary">
                      {approval.tool_name}
                    </span>
                    <StatusBadge value={approval.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Session note" />
            <div className="flex items-start gap-2 px-4 py-3 text-2xs leading-relaxed text-ink-faint">
              <Clock3 className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Session risk and quarantine state are computed by the backend in later weeks. This view
                is read-only; changing status is not supported by the current API.
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
