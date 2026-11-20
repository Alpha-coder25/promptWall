import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Link2,
  Lock,
  ShieldCheck,
  ShieldX,
  Wrench,
  XCircle,
} from "lucide-react";
import { api } from "../lib/api";
import { useWorkspace } from "../context/workspace";
import {
  Button,
  CodeBlock,
  CopyButton,
  EmptyState,
  ErrorState,
  InlineError,
  KeyValue,
  Modal,
  PageHeader,
  Panel,
  SeverityBadge,
  Skeleton,
  StatusBadge,
  Tabs,
  TextArea,
  useToast,
} from "../components/ui";
import { cn, formatDateTime, timeAgo, truncateMiddle } from "../lib/utils";
import { projectName } from "../lib/mock";
import type { Approval } from "../types";

type Tab = "pending" | "history" | "all";

function targetOf(approval: Approval): string | null {
  const args = approval.args;
  const target = args.to ?? args.url ?? args.table ?? args.queue ?? args.database;
  return typeof target === "string" ? target : null;
}

function QueueItem({
  approval,
  selected,
  onSelect,
}: {
  approval: Approval;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full border-b border-line/60 px-4 py-3 text-left transition-colors last:border-0",
        selected ? "bg-raised/80" : "hover:bg-raised/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded border border-line bg-overlay text-ink-muted">
          <Wrench className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{approval.tool_name}</span>
        <SeverityBadge severity={approval.risk_level} />
      </div>
      <p className="mt-1.5 truncate text-2xs text-ink-muted">
        {projectName(approval.project_id)} · {truncateMiddle(approval.session_id, 8, 4)}
      </p>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-2xs text-ink-faint">{timeAgo(approval.created_at)}</span>
        <StatusBadge value={approval.status} />
      </div>
    </button>
  );
}

export default function ApprovalsPage() {
  const { projectId } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"approve" | "reject" | null>(null);
  const [verified, setVerified] = useState(false);
  const [note, setNote] = useState("");
  const [confirmError, setConfirmError] = useState("");

  const approvals = useQuery({
    queryKey: ["approvals", projectId],
    queryFn: () => api.listApprovals(projectId),
  });

  const decision = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      api.decideApproval(id, action, "admin@promptwall.local"),
    onSuccess: (approval, variables) => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      toast({
        title: variables.action === "approve" ? "Approval recorded" : "Rejection recorded",
        description:
          variables.action === "approve"
            ? "The tool executor must verify this decision before running the call."
            : "The call is denied. Execution must not proceed.",
        variant: variables.action === "approve" ? "success" : "info",
      });
      setConfirm(null);
      setVerified(false);
      setNote("");
      setSelectedId(approval.id);
    },
    onError: (error: Error) => {
      setConfirmError(error.message);
    },
  });

  const list = useMemo(() => {
    const all = approvals.data ?? [];
    if (tab === "pending") return all.filter((a) => a.status === "pending");
    if (tab === "history") return all.filter((a) => a.status !== "pending");
    return all;
  }, [approvals.data, tab]);

  useEffect(() => {
    if (list.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!list.some((a) => a.id === selectedId)) {
      setSelectedId(list[0]!.id);
    }
  }, [list, selectedId]);

  const selected = list.find((a) => a.id === selectedId) ?? null;
  const pendingCount = approvals.data?.filter((a) => a.status === "pending").length ?? 0;

  const openConfirm = (action: "approve" | "reject") => {
    setVerified(false);
    setNote("");
    setConfirmError("");
    setConfirm(action);
  };

  const submit = () => {
    if (!selected || !confirm) return;
    if (!verified) {
      setConfirmError("Confirm that you verified the exact tool, arguments and target.");
      return;
    }
    decision.mutate({ id: selected.id, action: confirm });
  };

  return (
    <div>
      <PageHeader
        eyebrow={<><Lock className="h-3 w-3" /> Human control point</>}
        title="Tool Approvals"
        description="Sensitive tool calls wait here for a human decision. An approval authorizes one exact tool call — not the tool, the session, or future variations."
        actions={
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
            </span>
            <span className="text-xs text-ink-secondary">{pendingCount} pending</span>
          </div>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-md border border-info/20 bg-info/[0.05] px-3.5 py-2.5 text-xs leading-relaxed text-info/90">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This interface records a reviewer decision. It is not the enforcement boundary: the backend or a
          secure tool executor must verify the approval against the exact tool name and argument hash
          before executing anything.
        </span>
      </div>

      {approvals.isError ? (
        <Panel>
          <ErrorState onRetry={() => approvals.refetch()} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px,1fr]">
          <Panel className="h-fit overflow-hidden">
            <Tabs
              tabs={[
                { id: "pending", label: "Pending", count: pendingCount },
                {
                  id: "history",
                  label: "History",
                  count: approvals.data?.filter((a) => a.status !== "pending").length ?? 0,
                },
                { id: "all", label: "All", count: approvals.data?.length ?? 0 },
              ]}
              value={tab}
              onChange={setTab}
              className="px-2"
            />
            {approvals.isLoading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-5 w-5" />}
                title={tab === "pending" ? "Nothing waiting for review" : "No approvals in this view"}
                description={
                  tab === "pending"
                    ? "Sensitive calls will appear here when the tool gate holds them. An empty queue does not mean no tool calls occurred."
                    : "Decided and expired approvals appear here with their reviewer and execution status."
                }
              />
            ) : (
              <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                {list.map((approval) => (
                  <QueueItem
                    key={approval.id}
                    approval={approval}
                    selected={approval.id === selectedId}
                    onSelect={() => setSelectedId(approval.id)}
                  />
                ))}
              </div>
            )}
          </Panel>

          {selected ? (
            <div className="space-y-4">
              <Panel>
                <div className="border-b border-line px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md border border-warning/25 bg-warning/10 text-warning">
                      <Wrench className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-mono text-base font-semibold text-ink">
                        {selected.tool_name}
                      </h2>
                      <p className="text-2xs text-ink-faint">
                        approval {truncateMiddle(selected.id, 10, 4)} · submitted{" "}
                        {formatDateTime(selected.created_at)}
                      </p>
                    </div>
                    <SeverityBadge severity={selected.risk_level} />
                    <StatusBadge value={selected.status} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                      Why approval was required
                    </p>
                    <p className="text-xs leading-relaxed text-ink-secondary">{selected.explanation}</p>
                    <div className="mt-3 rounded border border-line bg-overlay/50 px-3 py-2 font-mono text-2xs text-ink-muted">
                      {selected.policy_rule}
                    </div>
                    <div className="mt-3 space-y-1">
                      {selected.signals.map((signal) => (
                        <p key={signal} className="flex items-start gap-1.5 text-2xs text-ink-muted">
                          <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-warning/80" />
                          {signal}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <dl>
                      <KeyValue label="Project">{projectName(selected.project_id)}</KeyValue>
                      <KeyValue label="Session">
                        <Link to={`/sessions/${selected.session_id}`} className="link font-mono">
                          {truncateMiddle(selected.session_id, 9, 4)}
                        </Link>
                      </KeyValue>
                      <KeyValue label="Request">
                        <Link to={`/events?q=${selected.request_id}`} className="link font-mono">
                          {truncateMiddle(selected.request_id, 9, 4)}
                        </Link>
                      </KeyValue>
                      <KeyValue label="Untrusted context">
                        {selected.untrusted_context ? (
                          <span className="text-warning">yes — external content entered the context</span>
                        ) : (
                          "no"
                        )}
                      </KeyValue>
                      <KeyValue label="Argument hash" mono>
                        <span className="inline-flex items-center gap-1">
                          <span title={selected.args_hash}>
                            {selected.args_hash.slice(0, 16)}…
                          </span>
                          <CopyButton value={selected.args_hash} label="" />
                        </span>
                      </KeyValue>
                    </dl>
                  </div>
                </div>
              </Panel>

              <Panel>
                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Exact proposed arguments</h3>
                    <p className="text-2xs text-ink-faint">
                      Approval is bound to this content. A modified call must be re-submitted.
                    </p>
                  </div>
                  <span className="hidden items-center gap-1 rounded border border-line bg-raised px-2 py-1 text-2xs text-ink-muted sm:flex">
                    <Lock className="h-3 w-3" /> read-only
                  </span>
                </div>
                <div className="space-y-3 p-4">
                  <CodeBlock
                    code={JSON.stringify(selected.args, null, 2)}
                    language="json"
                    maxHeight="300px"
                  />
                  {targetOf(selected) ? (
                    <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/[0.06] px-3 py-2 text-xs text-warning/90">
                      <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        Target: <span className="font-mono">{targetOf(selected)}</span>
                        {selected.untrusted_context
                          ? " — this target originated from untrusted content. Verify it independently."
                          : ""}
                      </span>
                    </div>
                  ) : null}
                  {selected.status === "pending" ? (
                    <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-2xs text-ink-faint">
                        Reviewing as <span className="text-ink-muted">admin@promptwall.local</span>
                      </p>
                      <div className="flex gap-2">
                        <Button variant="danger" onClick={() => openConfirm("reject")}>
                          <ShieldX className="h-3.5 w-3.5" /> Reject
                        </Button>
                        <Button variant="primary" onClick={() => openConfirm("approve")}>
                          <ShieldCheck className="h-3.5 w-3.5" /> Approve exact call
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-md border border-line bg-overlay/40 px-3 py-2 text-xs text-ink-muted">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                      <span>
                        Decided {selected.decided_at ? formatDateTime(selected.decided_at) : ""} by{" "}
                        {selected.decided_by ?? "system"}. Execution status:{" "}
                        <span className="font-mono text-ink-secondary">{selected.execution_status}</span>.
                        The console does not execute tools.
                      </span>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel>
                <div className="border-b border-line px-5 py-3">
                  <h3 className="text-sm font-semibold text-ink">Binding and execution</h3>
                </div>
                <div className="space-y-2.5 px-5 py-4 text-xs leading-relaxed text-ink-muted">
                  <p className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success/70" />
                    Bound to <span className="font-mono text-ink-secondary">{selected.tool_name}</span> and
                    argument hash <span className="font-mono text-ink-secondary">{selected.args_hash.slice(0, 12)}…</span>.
                  </p>
                  <p className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success/70" />
                    Single use: the executor consumes the approval when it runs the call.
                  </p>
                  <p className="flex items-start gap-2">
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger/70" />
                    Does not authorize changed arguments, another recipient, another session, or a retry
                    with different content.
                  </p>
                  <p className="flex items-start gap-2">
                    <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                    Approvals expire. An expired decision cannot be reused.
                  </p>
                </div>
              </Panel>
            </div>
          ) : (
            <Panel>
              <EmptyState
                icon={<Wrench className="h-5 w-5" />}
                title="Select an approval"
                description="Choose an item from the queue to review its exact arguments, policy rule and risk signals."
              />
            </Panel>
          )}
        </div>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => {
          if (!decision.isPending) setConfirm(null);
        }}
        title={confirm === "approve" ? "Approve this exact tool call?" : "Reject this tool call?"}
        description={
          selected
            ? `${selected.tool_name} · ${projectName(selected.project_id)}`
            : undefined
        }
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={decision.isPending}>
              Cancel
            </Button>
            <Button
              variant={confirm === "approve" ? "primary" : "danger"}
              onClick={submit}
              disabled={!verified || decision.isPending}
            >
              {decision.isPending ? "Recording…" : confirm === "approve" ? "Record approval" : "Record rejection"}
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="space-y-3">
            <div className="rounded-md border border-warning/25 bg-warning/[0.06] px-3 py-2.5 text-xs leading-relaxed text-warning/90">
              <p className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This authorizes only the operation shown below, for these exact arguments. It does not
                authorize future variations or other tools.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 rounded-md border border-line bg-overlay/40 px-3 py-2.5 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-ink-muted">Tool</span>
                <span className="font-mono text-ink">{selected.tool_name}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-muted">Target</span>
                <span className="truncate font-mono text-ink">{targetOf(selected) ?? "see arguments"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-muted">Argument hash</span>
                <span className="font-mono text-ink">{selected.args_hash.slice(0, 16)}…</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-ink-muted">Risk</span>
                <span className="text-ink">{selected.risk_level}</span>
              </div>
            </div>
            <div>
              <p className="mb-1 text-2xs text-ink-muted">Reviewer note (not stored by this API)</p>
              <TextArea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional context for the audit trail"
                className="min-h-16 text-xs"
                maxLength={500}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-cyan-400"
              />
              I verified the tool, arguments, target and session. I understand the backend must still
              authorize execution.
            </label>
            {confirmError ? <InlineError>{confirmError}</InlineError> : null}
          </div>
        ) : null}
      </Modal>

      <p className="mt-3 flex items-start gap-1.5 text-2xs text-ink-faint">
        <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0" />
        Fixture mode: decisions update local state only. The Week 1 backend has no approvals endpoints;
        the proposed contract is documented in frontend/README.md.
      </p>
    </div>
  );
}
