import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MessagesSquare, Search, ShieldAlert, ShieldCheck, Timer } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspace } from "../context/workspace";
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  RiskBar,
  StatusBadge,
  TableSkeleton,
  TextInput,
} from "../components/ui";
import { cn, formatDateTime, formatNumber, timeAgo, truncateMiddle } from "../lib/utils";
import { projectName } from "../lib/mock";
import type { SessionStatus } from "../types";

const STATUS_TABS: { id: SessionStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "watched", label: "Watched" },
  { id: "quarantined", label: "Quarantined" },
  { id: "normal", label: "Normal" },
];

export default function SessionsPage() {
  const { projectId, days, setDays } = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SessionStatus | "all">("all");

  const sessions = useQuery({
    queryKey: ["sessions", projectId, days, search],
    queryFn: () => api.listSessions({ projectId, days, search }),
  });

  const filtered = (sessions.data ?? []).filter((s) => status === "all" || s.status === status);
  const counts = {
    all: sessions.data?.length ?? 0,
    watched: sessions.data?.filter((s) => s.status === "watched").length ?? 0,
    quarantined: sessions.data?.filter((s) => s.status === "quarantined").length ?? 0,
    normal: sessions.data?.filter((s) => s.status === "normal").length ?? 0,
  };

  return (
    <div>
      <PageHeader
        eyebrow={<><MessagesSquare className="h-3 w-3" /> Conversation risk</>}
        title="Sessions"
        description="A session groups related requests and accumulates risk. Use it to spot repeated attempts that individually look borderline."
        actions={
          <>
            <div className="flex items-center rounded-md border border-line bg-surface p-0.5" role="group" aria-label="Time range">
              {[7, 14, 30].map((range) => (
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
            <Button onClick={() => sessions.refetch()} disabled={sessions.isFetching}>
              Refresh
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatus(tab.id)}
              aria-pressed={status === tab.id}
              className={cn(
                "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors",
                status === tab.id ? "bg-raised text-ink" : "text-ink-muted hover:text-ink-secondary",
              )}
            >
              {tab.label}
              <span className="font-mono text-2xs text-ink-faint">{counts[tab.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search session ID"
              aria-label="Search sessions"
              className="h-8 w-[220px] py-0 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      <Panel>
        {sessions.isError ? (
          <ErrorState onRetry={() => sessions.refetch()} />
        ) : sessions.isLoading ? (
          <TableSkeleton rows={9} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title={search || status !== "all" ? "No sessions match this view" : "No sessions yet"}
            description={
              search || status !== "all"
                ? "Change the status tab, clear the search, or widen the date range."
                : "Sessions appear when applications send a session identifier with their requests. The Week 1 backend does not create sessions automatically."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Project</th>
                  <th>Started</th>
                  <th>Last activity</th>
                  <th>Requests</th>
                  <th className="w-[150px]">Accumulated risk</th>
                  <th>Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((session) => {
                  const external =
                    (session.channel_counts.retrieved_document ?? 0) + (session.channel_counts.tool_output ?? 0);
                  return (
                    <tr
                      key={session.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/sessions/${session.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate(`/sessions/${session.id}`);
                      }}
                    >
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-accent/90">
                            {truncateMiddle(session.id, 9, 6)}
                          </span>
                          {session.status === "quarantined" ? (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-danger/15 text-danger animate-pulse-ring">
                              <ShieldAlert className="h-2.5 w-2.5" />
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-xs">{projectName(session.project_id)}</td>
                      <td className="whitespace-nowrap font-mono text-xs text-ink-muted">
                        {formatDateTime(session.started_at)}
                      </td>
                      <td className="whitespace-nowrap text-xs text-ink-muted">
                        <span className="inline-flex items-center gap-1">
                          <Timer className="h-3 w-3 text-ink-faint" />
                          {timeAgo(session.last_activity)}
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        {formatNumber(session.request_count)}
                        {external > 0 ? (
                          <span className="ml-1.5 text-2xs text-warning" title="External-channel messages in this session">
                            +{external} ext
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <RiskBar score={session.risk_score} compact />
                      </td>
                      <td>
                        <StatusBadge value={session.status} />
                      </td>
                      <td className="text-ink-faint">›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="mt-3 text-2xs text-ink-faint">
        Session status is a UI state in fixture mode. The Week 1 backend stores a sessions table but does
        not yet update accumulated risk or quarantine state.
      </p>
    </div>
  );
}
