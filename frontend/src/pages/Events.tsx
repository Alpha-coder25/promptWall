import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight,
  Download,
  FilterX,
  RefreshCw,
  Search,
  ShieldOff,
  ShieldQuestion,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { api, categoryLabel, type EventQuery } from "../lib/api";
import { useWorkspace } from "../context/workspace";
import {
  Button,
  ChannelBadge,
  DecisionBadge,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Pagination,
  RiskBar,
  SeverityBadge,
  TableSkeleton,
  TextInput,
  SelectInput,
  useToast,
  UnsupportedNote,
} from "../components/ui";
import { cn, formatDateTime, truncateMiddle } from "../lib/utils";
import { ALL_CATEGORIES, CATEGORY_META, projectName, severityOf } from "../lib/mock";
import type { Channel, Decision } from "../types";

const PAGE_SIZE = 12;

const CHANNELS: Channel[] = ["user", "system", "assistant", "retrieved_document", "tool_output"];

function csvCell(value: string | number): string {
  const text = String(value);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function EventsPage() {
  const { projectId, days, setDays } = useWorkspace();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();

  const [search, setSearch] = useState(params.get("q") ?? "");
  const [decision, setDecision] = useState<Decision | "all">("all");
  const [category, setCategory] = useState("all");
  const [layer, setLayer] = useState("all");
  const [channel, setChannel] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const query: EventQuery = useMemo(
    () => ({
      projectId,
      days,
      decision,
      category,
      layer,
      channel,
      severity,
      search,
      page,
      pageSize: PAGE_SIZE,
    }),
    [projectId, days, decision, category, layer, channel, severity, search, page],
  );

  const events = useQuery({
    queryKey: ["events", query],
    queryFn: () => api.listEvents(query),
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    setPage(1);
  }, [projectId, days, decision, category, layer, channel, severity, search]);

  useEffect(() => {
    setSearch(params.get("q") ?? "");
  }, [params]);

  const total = events.data?.total ?? 0;
  const visible = events.data?.items ?? [];
  const activeFilters =
    (decision !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (layer !== "all" ? 1 : 0) +
    (channel !== "all" ? 1 : 0) +
    (severity !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setDecision("all");
    setCategory("all");
    setLayer("all");
    setChannel("all");
    setSeverity("all");
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await api.listEvents({ ...query, page: 1, pageSize: 500 });
      const header = [
        "event_id",
        "timestamp",
        "category",
        "detection_layer",
        "channel",
        "risk_score",
        "decision",
        "inspection_status",
        "project",
        "session_id",
        "request_id",
      ];
      const rows = all.items.map((event) => [
        event.id,
        event.created_at,
        event.detections[0]?.category ?? "",
        event.detections[0]?.layer ?? "",
        event.messages.find((m) => m.channel !== "system")?.channel ?? "",
        event.final_score.toFixed(3),
        event.decision,
        event.inspection_status,
        projectName(event.project_id),
        event.session_id,
        event.request_id,
      ]);
      const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `promptwall-events-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${all.items.length} events`, variant: "success" });
    } catch {
      toast({ title: "Export failed", description: "The events could not be exported.", variant: "error" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={<><SlidersHorizontal className="h-3 w-3" /> Investigation workspace</>}
        title="Security Events"
        description="Every inspected request with its decision, scoring, and evidence. Filter, sort by time, and open an event to see why the gateway decided what it did."
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
            <Button onClick={() => events.refetch()} disabled={events.isFetching}>
              <RefreshCw className={cn("h-3.5 w-3.5", events.isFetching && "animate-spin")} /> Refresh
            </Button>
            <Button onClick={exportCsv} disabled={exporting || total === 0}>
              <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          </>
        }
      />

      <Panel className="mb-4">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <TextInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search event, request or session ID"
                aria-label="Search events by ID"
                className="pl-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap">
              <SelectInput
                aria-label="Filter by decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value as Decision | "all")}
                className="w-full lg:w-[124px]"
              >
                <option value="all">All decisions</option>
                <option value="allow">Allow</option>
                <option value="sanitize">Sanitize</option>
                <option value="block">Block</option>
              </SelectInput>
              <SelectInput
                aria-label="Filter by threat category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full lg:w-[172px]"
              >
                <option value="all">All categories</option>
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                aria-label="Filter by detection layer"
                value={layer}
                onChange={(e) => setLayer(e.target.value)}
                className="w-full lg:w-[140px]"
              >
                <option value="all">All layers</option>
                <option value="heuristic">Heuristic</option>
                <option value="classifier">Classifier</option>
                <option value="judge">LLM judge</option>
                <option value="normalization">Normalization</option>
              </SelectInput>
              <SelectInput
                aria-label="Filter by message channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full lg:w-[158px]"
              >
                <option value="all">All channels</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c.replace("_", " ")}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                aria-label="Filter by severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full lg:w-[126px]"
              >
                <option value="all">All severity</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </SelectInput>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-2.5">
            <span className="text-2xs text-ink-muted">
              {events.isLoading ? "Loading events…" : `${total} matching event${total === 1 ? "" : "s"}`}
            </span>
            {activeFilters > 0 ? (
              <>
                <span className="text-2xs text-ink-faint">·</span>
                <span className="text-2xs text-ink-faint">
                  {activeFilters} filter{activeFilters === 1 ? "" : "s"} active
                </span>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded border border-line bg-raised px-1.5 py-0.5 text-2xs text-ink-muted hover:text-ink"
                >
                  <FilterX className="h-3 w-3" /> Clear
                </button>
              </>
            ) : null}
            <span className="ml-auto text-2xs text-ink-faint">
              Times shown in your local timezone · sorted newest first
            </span>
          </div>
        </div>
      </Panel>

      <Panel>
        {events.isError ? (
          <ErrorState onRetry={() => events.refetch()} />
        ) : events.isLoading ? (
          <TableSkeleton rows={10} cols={8} />
        ) : visible.length === 0 ? (
          activeFilters > 0 ? (
            <EmptyState
              icon={<ShieldOff className="h-5 w-5" />}
              title="No events match these filters"
              description="Broaden the date range or clear the filters. The table never shows partial or estimated matches."
              action={
                <Button onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" /> Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<ShieldQuestion className="h-5 w-5" />}
              title="No inspected requests yet"
              description="Point an application at /v1/chat/completions with a project key, then refresh. Empty is a valid security state, not an error."
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th className="w-[104px]">Event</th>
                    <th className="w-[150px]">Timestamp</th>
                    <th>Category</th>
                    <th>Layer</th>
                    <th>Channel</th>
                    <th className="w-[132px]">Risk score</th>
                    <th>Decision</th>
                    <th>Project</th>
                    <th className="hidden 2xl:table-cell">Session</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((event) => (
                    <tr
                      key={event.id}
                      className="group cursor-pointer"
                      onClick={() => navigate(`/events/${event.id}`)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/events/${event.id}`);
                        }
                      }}
                      aria-label={`Open event ${event.id}`}
                    >
                      <td className="font-mono text-xs text-accent/90">{shortId(event.id)}</td>
                      <td className="whitespace-nowrap font-mono text-xs text-ink-muted">
                        {formatDateTime(event.created_at)}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={severityOf(event.final_score)} />
                          <span className="max-w-[170px] truncate text-xs text-ink-secondary">
                            {event.detections[0] ? categoryLabel(event.detections[0].category) : "No detection"}
                          </span>
                        </div>
                      </td>
                      <td className="text-xs capitalize text-ink-muted">
                        {event.detections[0]?.layer ?? "—"}
                      </td>
                      <td>
                        <ChannelBadge
                          channel={
                            event.messages.find((m) => m.channel !== "system")?.channel ?? "user"
                          }
                        />
                      </td>
                      <td>
                        <RiskBar score={event.final_score} decision={event.decision} compact />
                      </td>
                      <td>
                        <DecisionBadge decision={event.decision} />
                      </td>
                      <td className="max-w-[150px] truncate text-xs">{projectName(event.project_id)}</td>
                      <td className="hidden font-mono text-xs text-ink-muted 2xl:table-cell">
                        <span title={event.session_id}>{truncateMiddle(event.session_id, 8, 4)}</span>
                      </td>
                      <td>
                        <ChevronRight className="h-3.5 w-3.5 text-ink-faint transition-colors group-hover:text-ink" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </Panel>

      <div className="mt-3">
        <UnsupportedNote>
          Week 1 backend limits: <span className="font-mono">/admin/events</span> supports project,
          decision, date range and a 500-row cap, but not pagination, category, channel, severity or ID
          search. This explorer filters in the browser and labels every control it uses; see{" "}
          <span className="font-mono">frontend/README.md</span> for the proposed query contract.
        </UnsupportedNote>
      </div>
    </div>
  );
}

function shortId(id: string) {
  return id.slice(0, 8);
}
