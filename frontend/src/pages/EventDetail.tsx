import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDashed,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  Info,
  Layers,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api, categoryLabel } from "../lib/api";
import {
  BackLink,
  Button,
  ChannelBadge,
  CodeBlock,
  CopyButton,
  DecisionBadge,
  EmptyState,
  ErrorState,
  KeyValue,
  Panel,
  PanelHeader,
  RiskBar,
  SectionTitle,
  SeverityBadge,
  Skeleton,
  StatusBadge,
  UnsupportedNote,
  riskTone,
} from "../components/ui";
import { cn, formatDateTime, formatMs, timeAgo, truncateMiddle } from "../lib/utils";
import { CATEGORY_META, getProject, projectName, severityOf } from "../lib/mock";
import type { SecurityEvent } from "../types";

type StageStatus = "executed" | "skipped" | "not_implemented";

interface Stage {
  name: string;
  status: StageStatus;
  detail: string;
}

function pipelineFor(event: SecurityEvent): Stage[] {
  const hasNormalizerFlags = event.messages.some((m) => m.flags.length > 0);
  return [
    {
      name: "Request received",
      status: "executed",
      detail: `Authenticated project request · ${event.messages.length} messages · max body size enforced`,
    },
    {
      name: "Normalization",
      status: "executed",
      detail: hasNormalizerFlags
        ? `Reversible mapping applied · flags: ${[
            ...new Set(event.messages.flatMap((m) => m.flags)),
          ].join(", ")}`
        : "Unicode normalized · no obfuscation flags raised",
    },
    {
      name: "Heuristic detection",
      status: "executed",
      detail: `${event.detections.length} detection${event.detections.length === 1 ? "" : "s"} · grouped score ${event.final_score.toFixed(2)}`,
    },
    {
      name: "Classifier",
      status: "not_implemented",
      detail: "Not part of the Week 1 gateway. No classifier score was produced.",
    },
    {
      name: "LLM judge",
      status: "not_implemented",
      detail: "Not part of the Week 1 gateway. Uncertain cases are resolved by policy mode.",
    },
    {
      name: "Decision engine",
      status: "executed",
      detail: `${event.explanation.policy_applied} · final decision ${event.decision}`,
    },
    {
      name: event.decision === "block" ? "Refusal" : event.decision === "sanitize" ? "Sanitization" : "Pass-through",
      status: event.decision === "allow" ? "skipped" : "executed",
      detail:
        event.decision === "block"
          ? "A refusal response was returned with finish_reason=content_filter; nothing was forwarded."
          : event.decision === "sanitize"
            ? "Detected spans were replaced before forwarding. Originals remain in the offset map only."
            : "No modification was required.",
    },
    {
      name: "Provider forwarding",
      status: event.explanation.forwarded ? "executed" : "skipped",
      detail: event.explanation.forwarded
        ? "Request forwarded to the configured OpenAI-compatible upstream."
        : "Skipped: the request was refused.",
    },
    {
      name: "Output inspection",
      status: "not_implemented",
      detail: "Response inspection is scheduled for a later week. Output was passed through.",
    },
    {
      name: "Tool-call gate",
      status: "not_implemented",
      detail: "Tool-call authorization and approvals are not enforced by this version of the gateway.",
    },
    {
      name: "Audit record",
      status: "executed",
      detail: "Request, messages, detections and decision committed in one transaction before enforcement.",
    },
  ];
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === "executed")
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-success/40 bg-success/15 text-success">
        <Check className="h-3 w-3" />
      </span>
    );
  if (status === "skipped")
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line-strong bg-raised text-ink-faint">
        <CircleDashed className="h-3 w-3" />
      </span>
    );
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-overlay text-ink-faint">
      <span className="h-1 w-1 rounded-full bg-ink-faint" />
    </span>
  );
}

function MessageCard({ message, index }: { message: SecurityEvent["messages"][number]; index: number }) {
  const [revealed, setRevealed] = useState(false);
  const external = message.channel === "retrieved_document" || message.channel === "tool_output";
  const content = revealed && message.original_text ? message.original_text : message.redacted_text;

  return (
    <div className="border-b border-line/60 last:border-0">
      <div className="flex flex-wrap items-center gap-2 bg-overlay/40 px-4 py-2">
        <span className="font-mono text-2xs text-ink-faint">#{index}</span>
        <span className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-2xs uppercase text-ink-secondary">
          {message.role}
        </span>
        <ChannelBadge channel={message.channel} />
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-2xs",
            message.trust_level === "trusted"
              ? "border-success/25 bg-success/[0.07] text-success"
              : external
                ? "border-warning/25 bg-warning/[0.07] text-warning"
                : "border-line bg-raised text-ink-muted",
          )}
        >
          {message.trust_level} trust
        </span>
        <span className="text-2xs text-ink-faint">label: {message.label_source}</span>
        {message.flags.map((flag) => (
          <span
            key={flag}
            className="rounded border border-info/25 bg-info/[0.07] px-1.5 py-0.5 font-mono text-2xs text-info/90"
          >
            {flag}
          </span>
        ))}
        {message.raw_retained && message.original_text ? (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 text-2xs text-ink-muted hover:text-ink"
            aria-pressed={revealed}
          >
            {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {revealed ? "Hide raw text" : "Reveal raw text"}
          </button>
        ) : (
          <span className="ml-auto text-2xs text-ink-faint">raw text not retained</span>
        )}
      </div>
      <div className="px-4 py-3">
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink-secondary">
          {content}
        </pre>
        {message.sanitized_text ? (
          <div className="mt-3 rounded-md border border-warning/20 bg-warning/[0.04] p-2.5">
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-warning/80">
              Forwarded after sanitization
            </p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-ink-secondary">
              {message.sanitized_text}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function EventDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const eventQuery = useQuery({ queryKey: ["event", id], queryFn: () => api.getEvent(id) });
  const relatedQuery = useQuery({
    queryKey: ["related-events", id],
    queryFn: () => api.relatedEvents(eventQuery.data?.session_id ?? ""),
    enabled: Boolean(eventQuery.data?.session_id),
  });
  const [copiedJson, setCopiedJson] = useState(false);

  if (eventQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Skeleton className="h-96 xl:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (eventQuery.isError) {
    return (
      <Panel>
        <ErrorState onRetry={() => eventQuery.refetch()} />
      </Panel>
    );
  }

  const event = eventQuery.data;
  if (!event) {
    return (
      <Panel>
        <EmptyState
          title="Event not found"
          description="This event ID does not exist in the selected retention window, or it belongs to a project you cannot access."
          action={<Button onClick={() => navigate("/events")}>Back to events</Button>}
        />
      </Panel>
    );
  }

  const project = getProject(event.project_id);
  const severity = severityOf(event.final_score);
  const category = event.detections[0]?.category;
  const taxonomy = category ? CATEGORY_META[category] : null;
  const stages = pipelineFor(event);
  const related = relatedQuery.data?.filter((e) => e.id !== event.id) ?? [];

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(event, null, 2));
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 1600);
    } catch {
      setCopiedJson(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <BackLink to="/events">Security events</BackLink>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={copyJson}>
            {copiedJson ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedJson ? "Copied" : "Copy JSON"}
          </Button>
          <Button size="sm" onClick={() => navigate(`/sessions/${event.session_id}`)}>
            Open session <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 border-b border-line pb-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <DecisionBadge decision={event.decision} />
            <SeverityBadge severity={severity} />
            <StatusBadge value={event.inspection_status} />
            {event.explanation.session_influence ? (
              <span className="inline-flex items-center gap-1 rounded border border-warning/25 bg-warning/[0.07] px-2 py-0.5 text-xs text-warning">
                <AlertTriangle className="h-3 w-3" /> session risk applied
              </span>
            ) : null}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {taxonomy ? taxonomy.label : "Request inspection"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-ink-muted">
            <span>event {event.id}</span>
            <span className="text-ink-faint">·</span>
            <span>{formatDateTime(event.created_at)}</span>
            <span className="text-ink-faint">·</span>
            <span>{projectName(event.project_id)}</span>
          </p>
        </div>
        <div className="shrink-0 rounded-md border border-line bg-surface px-4 py-2.5">
          <p className="text-2xs uppercase tracking-wider text-ink-faint">Final risk score</p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className={cn("font-mono text-2xl font-semibold", riskTone(event.final_score, event.decision))}>
              {event.final_score.toFixed(3)}
            </span>
            <RiskBar score={event.final_score} decision={event.decision} compact />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel>
            <PanelHeader title="Event summary" subtitle="Identifiers and processing facts" />
            <div className="grid grid-cols-1 gap-x-8 px-5 py-3 sm:grid-cols-2">
              <dl>
                <KeyValue label="Event ID" mono>
                  <span className="inline-flex items-center gap-1.5">
                    <span title={event.id}>{truncateMiddle(event.id, 12, 6)}</span>
                    <CopyButton value={event.id} label="" />
                  </span>
                </KeyValue>
                <KeyValue label="Request ID" mono>
                  <span className="inline-flex items-center gap-1.5">
                    <span title={event.request_id}>{truncateMiddle(event.request_id, 12, 6)}</span>
                    <CopyButton value={event.request_id} label="" />
                  </span>
                </KeyValue>
                <KeyValue label="Session" mono>
                  <Link to={`/sessions/${event.session_id}`} className="link">
                    {truncateMiddle(event.session_id, 12, 6)}
                  </Link>
                </KeyValue>
                <KeyValue label="Project">{projectName(event.project_id)}</KeyValue>
              </dl>
              <dl>
                <KeyValue label="Policy applied">v{event.policy_version}</KeyValue>
                <KeyValue label="Processing latency" mono>
                  {formatMs(event.latency_ms)}
                </KeyValue>
                <KeyValue label="Inspection status">
                  <StatusBadge value={event.inspection_status} />
                </KeyValue>
                <KeyValue label="Content hash" mono>
                  <span title={event.content_hash} className="text-ink-muted">
                    {event.content_hash.slice(0, 16)}…
                  </span>
                </KeyValue>
              </dl>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Decision explanation"
              subtitle="Why the gateway reached this outcome"
              actions={
                <span className="chip">
                  <Sparkles className="h-3 w-3 text-accent" />
                  {event.explanation.forwarded ? "forwarded" : "not forwarded"}
                </span>
              }
            />
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm leading-relaxed text-ink-secondary">{event.explanation.summary}</p>
              <div>
                <SectionTitle>Contributing signals</SectionTitle>
                <ul className="space-y-1.5">
                  {event.explanation.signals.map((signal) => (
                    <li key={signal} className="flex items-start gap-2 text-xs text-ink-muted">
                      <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-accent/70" />
                      <span>{signal}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-line bg-overlay/40 px-3 py-2">
                  <p className="text-2xs uppercase tracking-wider text-ink-faint">Policy applied</p>
                  <p className="mt-1 text-xs text-ink-secondary">{event.explanation.policy_applied}</p>
                </div>
                <div className="rounded-md border border-line bg-overlay/40 px-3 py-2">
                  <p className="text-2xs uppercase tracking-wider text-ink-faint">Session influence</p>
                  <p className="mt-1 text-xs text-ink-secondary">
                    {event.explanation.session_influence ?? "None — this decision used request signals only."}
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Threat information"
              subtitle={`${event.detections.length} detection${event.detections.length === 1 ? "" : "s"} recorded`}
            />
            {event.detections.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-5 w-5" />}
                title="No detections"
                description="This request was inspected and no category matched. That is not proof of safety."
              />
            ) : (
              <div className="divide-y divide-line/60">
                {event.detections.map((detection) => {
                  const meta = CATEGORY_META[detection.category];
                  return (
                    <div key={detection.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink">{meta.label}</span>
                        <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-2xs capitalize text-ink-muted">
                          {detection.layer}
                        </span>
                        <span className="ml-auto font-mono text-xs text-ink-secondary">
                          score {detection.score.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{detection.detail}</p>

                      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <div className="rounded-md border border-line bg-overlay/40 p-3">
                          <p className="text-2xs uppercase tracking-wider text-ink-faint">Evidence span</p>
                          {detection.span ? (
                            <>
                              <p className="mt-1.5 break-all font-mono text-xs text-ink-secondary">
                                {detection.span.preview}
                              </p>
                              <p className="mt-1 font-mono text-2xs text-ink-faint">
                                chars {detection.span.start}–{detection.span.end} · masked preview (backend
                                default)
                              </p>
                            </>
                          ) : (
                            <p className="mt-1.5 text-xs text-ink-faint">
                              No span — this signal is document-level.
                            </p>
                          )}
                        </div>
                        <div className="rounded-md border border-line bg-overlay/40 p-3">
                          <p className="text-2xs uppercase tracking-wider text-ink-faint">Taxonomy</p>
                          <div className="mt-1.5 space-y-1 text-xs">
                            <p className="flex justify-between gap-2">
                              <span className="text-ink-muted">MITRE ATLAS</span>
                              <span className="font-mono text-ink-secondary">{meta.atlas}</span>
                            </p>
                            <p className="flex justify-between gap-2">
                              <span className="text-ink-muted">OWASP LLM</span>
                              <span className="font-mono text-ink-secondary">{meta.owasp}</span>
                            </p>
                            <p className="flex justify-between gap-2">
                              <span className="text-ink-muted">NIST AI RMF</span>
                              <span className="font-mono text-ink-secondary">{meta.nist}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t border-line px-5 py-2.5 text-2xs text-ink-faint">
              Taxonomy identifiers come from the seeded map. Verify against the official ATLAS / OWASP
              pages before citing them in a report.
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Message inspection"
              subtitle="Untrusted content is rendered as text, never as HTML"
            />
            <div className="border-b border-line/60 bg-warning/[0.04] px-5 py-2 text-2xs text-warning/80">
              Prompts and retrieved documents are treated as untrusted data. Raw content is only shown
              when the project retains it.
            </div>
            {event.messages.map((message, index) => (
              <MessageCard key={message.position} message={message} index={index} />
            ))}
          </Panel>

          <Panel>
            <PanelHeader
              title="Detection pipeline"
              subtitle="Only stages that actually ran are marked as executed"
              actions={
                <div className="hidden items-center gap-3 text-2xs text-ink-muted sm:flex">
                  <span className="flex items-center gap-1"><StageIcon status="executed" /> executed</span>
                  <span className="flex items-center gap-1"><StageIcon status="skipped" /> skipped</span>
                  <span className="flex items-center gap-1"><StageIcon status="not_implemented" /> not implemented</span>
                </div>
              }
            />
            <ol className="px-5 py-4">
              {stages.map((stage, index) => (
                <li key={stage.name} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < stages.length - 1 ? (
                    <span
                      className="absolute left-[9px] top-6 h-[calc(100%-12px)] w-px bg-line"
                      aria-hidden
                    />
                  ) : null}
                  <StageIcon status={stage.status} />
                  <div className="-mt-0.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-medium",
                          stage.status === "not_implemented" ? "text-ink-muted" : "text-ink",
                        )}
                      >
                        {stage.name}
                      </span>
                      {stage.status === "not_implemented" ? (
                        <span className="rounded border border-line bg-raised px-1.5 py-0.5 text-2xs text-ink-faint">
                          not in this build
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{stage.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-line px-5 py-3">
              <UnsupportedNote>
                Classifier, LLM judge, output inspection and the tool-call gate are later-week work. This
                view shows them as not implemented instead of implying they ran.
              </UnsupportedNote>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Risk assessment" />
            <div className="px-4 py-4">
              <div className="flex items-center justify-between">
                <span className={cn("font-mono text-3xl font-semibold", riskTone(event.final_score, event.decision))}>
                  {event.final_score.toFixed(3)}
                </span>
                <DecisionBadge decision={event.decision} />
              </div>
              <div className="mt-3">
                <RiskBar score={event.final_score} decision={event.decision} />
              </div>
              <div className="mt-2 flex justify-between font-mono text-2xs text-ink-faint">
                <span>0.00</span>
                <span>0.35 low</span>
                <span>0.70 high</span>
                <span>1.00</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-muted">
                {event.decision === "allow"
                  ? "Below the block thresholds for this channel. The request was forwarded."
                  : event.decision === "sanitize"
                    ? "Above the sanitize threshold. Spans were removed; the surrounding content was forwarded."
                    : "Above the block threshold. The provider never received this request."}
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Project context" />
            <div className="px-4 py-3">
              <dl>
                <KeyValue label="Project">{projectName(event.project_id)}</KeyValue>
                <KeyValue label="Mode">{project?.mode ?? "—"}</KeyValue>
                <KeyValue label="Fail mode">{project?.fail_mode ?? "—"}</KeyValue>
                <KeyValue label="Raw text retained">
                  {project?.store_raw_text ? "yes" : "no"}
                </KeyValue>
                <KeyValue label="Retention">{project ? `${project.retention_days} days` : "—"}</KeyValue>
              </dl>
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => navigate("/policies")}>
                  <Layers className="h-3.5 w-3.5" /> Policy
                </Button>
                <Button size="sm" className="flex-1" onClick={() => navigate(`/sessions/${event.session_id}`)}>
                  <Fingerprint className="h-3.5 w-3.5" /> Session
                </Button>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Related activity"
              subtitle={`Session ${truncateMiddle(event.session_id, 8, 4)}`}
              actions={
                <Link to={`/sessions/${event.session_id}`} className="text-2xs text-accent/90">
                  Open
                </Link>
              }
            />
            {relatedQuery.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : related.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-faint">
                No other events in this session.
              </p>
            ) : (
              <ul className="divide-y divide-line/60">
                {related.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/events/${item.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised/60"
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          item.decision === "block"
                            ? "bg-danger"
                            : item.decision === "sanitize"
                              ? "bg-warning"
                              : "bg-success",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-ink-secondary">
                          {item.detections[0] ? categoryLabel(item.detections[0].category) : "No detection"}
                        </p>
                        <p className="text-2xs text-ink-faint">
                          {timeAgo(item.created_at)} · {item.decision}
                        </p>
                      </div>
                      <span className="font-mono text-2xs text-ink-muted">{item.final_score.toFixed(2)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Raw record" subtitle="Audit fields as returned by the API" />
            <div className="p-4">
              <CodeBlock
                code={JSON.stringify(
                  {
                    id: event.id,
                    decision: event.decision,
                    final_score: event.final_score,
                    inspection_status: event.inspection_status,
                    policy_version: event.policy_version,
                    latency_ms: event.latency_ms,
                    content_hash: event.content_hash,
                    detector_versions: { heuristic: "week1" },
                  },
                  null,
                  2,
                )}
                language="json"
                maxHeight="260px"
              />
              <p className="mt-2 flex items-start gap-1.5 text-2xs text-ink-faint">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                No raw prompt content is included in the audit record by default.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

