/**
 * Data access layer.
 *
 * The console currently runs against the fixture dataset. Every function here is
 * the single seam where a real PromptWall gateway will be wired in later:
 * replace the bodies with fetch calls against VITE_API_BASE_URL, keep the
 * signatures. See README.md ("Backend integration") for the endpoint map and
 * the fields the current Week 1 backend does not yet return.
 */

import type {
  Alert,
  ApiKey,
  Approval,
  DashboardFilters,
  Decision,
  EvaluationRun,
  OverviewData,
  Policy,
  Project,
  SecurityEvent,
  Session,
  TimeSeriesPoint,
} from "../types";
import {
  ALERTS,
  API_KEYS,
  APPROVALS,
  CATEGORY_META,
  EVENTS,
  EVALUATION_RUNS,
  PROJECTS,
  SESSIONS,
  buildPolicy,
  eventCategory,
  projectName,
  severityOf,
} from "./mock";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
export const IS_LIVE = API_BASE_URL.length > 0;

const latency = (ms = 180) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms + Math.random() * 140);
  });

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function computeOverview(filters: DashboardFilters): OverviewData {
  const now = Date.now();
  const start = now - filters.days * 86_400_000;
  const previousStart = start - filters.days * 86_400_000;

  const scoped = EVENTS.filter(
    (e) => (filters.projectId === "all" || e.project_id === filters.projectId) && Date.parse(e.created_at) <= now,
  );
  const current = scoped.filter((e) => Date.parse(e.created_at) >= start);
  const previous = scoped.filter((e) => {
    const t = Date.parse(e.created_at);
    return t >= previousStart && t < start;
  });

  const decisionCounts: Record<Decision, number> = { allow: 0, sanitize: 0, block: 0 };
  const threatMap = new Map<string, number>();
  let latencySum = 0;
  const latencies: number[] = [];

  for (const event of current) {
    decisionCounts[event.decision] += 1;
    latencySum += event.latency_ms;
    latencies.push(event.latency_ms);
    if (event.detections.length > 0 && event.final_score >= 0.35) {
      const category = eventCategory(event);
      threatMap.set(category, (threatMap.get(category) ?? 0) + 1);
    }
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0;

  const buckets = new Map<number, TimeSeriesPoint>();
  const todayStart = startOfDay(now);
  for (let i = filters.days - 1; i >= 0; i -= 1) {
    const key = todayStart - i * 86_400_000;
    buckets.set(key, { bucket: new Date(key).toISOString(), allowed: 0, sanitized: 0, blocked: 0 });
  }

  for (const event of current) {
    const key = startOfDay(Date.parse(event.created_at));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (event.decision === "allow") bucket.allowed += 1;
    else if (event.decision === "sanitize") bucket.sanitized += 1;
    else bucket.blocked += 1;
  }

  const highRiskSessions = SESSIONS.filter(
    (s) => filters.projectId === "all" || s.project_id === filters.projectId,
  )
    .filter((s) => s.risk_score >= 0.55 || s.status !== "normal")
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 5);

  return {
    metrics: {
      totalRequests: current.length,
      threats: [...threatMap.values()].reduce((a, b) => a + b, 0),
      blocked: decisionCounts.block,
      sanitized: decisionCounts.sanitize,
      allowed: decisionCounts.allow,
      avgLatency: current.length ? latencySum / current.length : 0,
      p95Latency: p95,
      previous:
        previous.length > 0
          ? {
              totalRequests: previous.length,
              threats: previous.filter((e) => e.detections.length > 0 && e.final_score >= 0.35).length,
            }
          : null,
    },
    series: [...buckets.values()],
    decisionCounts,
    threatCounts: [...threatMap.entries()]
      .map(([category, count]) => ({ category: category as OverviewData["threatCounts"][number]["category"], count }))
      .sort((a, b) => b.count - a.count),
    recentEvents: [...current]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 6),
    highRiskSessions,
    pendingApprovals: APPROVALS.filter(
      (a) => a.status === "pending" && (filters.projectId === "all" || a.project_id === filters.projectId),
    ).length,
    uninspected: current.filter((e) => e.inspection_status === "uninspected").length,
  };
}

export interface EventQuery {
  projectId: string;
  days: number;
  decision: Decision | "all";
  category: string;
  channel: string;
  severity: string;
  layer: string;
  search: string;
  page: number;
  pageSize: number;
}

export interface EventPage {
  items: SecurityEvent[];
  total: number;
  page: number;
  pageSize: number;
}

function matchesQuery(event: SecurityEvent, q: EventQuery): boolean {
  if (q.projectId !== "all" && event.project_id !== q.projectId) return false;
  if (Date.parse(event.created_at) < Date.now() - q.days * 86_400_000) return false;
  if (q.decision !== "all" && event.decision !== q.decision) return false;
  if (q.category !== "all" && !event.detections.some((d) => d.category === q.category)) return false;
  if (q.channel !== "all" && !event.messages.some((m) => m.channel === q.channel)) return false;
  if (q.layer !== "all" && !event.detections.some((d) => d.layer === q.layer)) return false;
  if (q.severity !== "all" && severityOf(event.final_score) !== q.severity) return false;
  if (q.search.trim()) {
    const needle = q.search.trim().toLowerCase();
    const haystack = `${event.id} ${event.request_id} ${event.session_id}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export const api = {
  async getOverview(filters: DashboardFilters): Promise<OverviewData> {
    await latency();
    return computeOverview(filters);
  },

  async listEvents(query: EventQuery): Promise<EventPage> {
    await latency();
    const filtered = EVENTS.filter((e) => matchesQuery(e, query));
    const start = (query.page - 1) * query.pageSize;
    return {
      items: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  async getEvent(id: string): Promise<SecurityEvent | null> {
    await latency(120);
    return EVENTS.find((e) => e.id === id) ?? null;
  },

  async relatedEvents(sessionId: string): Promise<SecurityEvent[]> {
    await latency(120);
    return EVENTS.filter((e) => e.session_id === sessionId).slice(0, 8);
  },

  async listSessions(filters: { projectId: string; days: number; search: string }): Promise<Session[]> {
    await latency();
    return SESSIONS.filter((s) => {
      if (filters.projectId !== "all" && s.project_id !== filters.projectId) return false;
      if (Date.parse(s.last_activity) < Date.now() - filters.days * 86_400_000) return false;
      if (filters.search.trim() && !s.id.toLowerCase().includes(filters.search.trim().toLowerCase()))
        return false;
      return true;
    }).sort((a, b) => b.risk_score - a.risk_score);
  },

  async getSession(id: string): Promise<Session | null> {
    await latency(120);
    return SESSIONS.find((s) => s.id === id) ?? null;
  },

  async sessionEvents(sessionId: string): Promise<SecurityEvent[]> {
    await latency(140);
    return EVENTS.filter((e) => e.session_id === sessionId).sort(
      (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
    );
  },

  async listApprovals(projectId: string): Promise<Approval[]> {
    await latency();
    return APPROVALS.filter((a) => projectId === "all" || a.project_id === projectId).sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  },

  async decideApproval(
    id: string,
    decision: "approve" | "reject",
    reviewer: string,
  ): Promise<Approval> {
    await latency(260);
    const approval = APPROVALS.find((a) => a.id === id);
    if (!approval) throw new Error("Approval not found.");
    if (approval.status !== "pending") throw new Error("This approval has already been decided.");
    approval.status = decision === "approve" ? "approved" : "rejected";
    approval.decided_by = reviewer;
    approval.decided_at = new Date().toISOString();
    approval.execution_status =
      decision === "approve" ? "pending_executor" : approval.policy_rule.includes("deny") ? "denied" : "denied";
    return { ...approval };
  },

  async getPolicy(projectId: string): Promise<Policy> {
    await latency(120);
    const project = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0]!;
    return buildPolicy(project);
  },

  async savePolicy(projectId: string, input: { mode: Policy["mode"]; fail_mode: Policy["fail_mode"]; thresholds: Policy["thresholds"]; yaml: string }): Promise<Policy> {
    await latency(320);
    const project = PROJECTS.find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found.");
    project.mode = input.mode;
    project.fail_mode = input.fail_mode;
    project.active_policy_version += 1;
    const policy = buildPolicy(project);
    policy.thresholds = input.thresholds;
    policy.yaml = input.yaml;
    policy.updated_at = new Date().toISOString();
    return policy;
  },

  async listProjects(): Promise<Project[]> {
    await latency(120);
    return PROJECTS.map((p) => ({ ...p }));
  },

  async createProject(input: { name: string; mode: Project["mode"]; fail_mode: Project["fail_mode"]; store_raw_text: boolean; retention_days: number }): Promise<{ project: Project; apiKey: string }> {
    await latency(320);
    const project: Project = {
      id: `prj_${Math.random().toString(16).slice(2, 10)}`,
      name: input.name,
      description: "Created from the console (fixture mode).",
      mode: input.mode,
      fail_mode: input.fail_mode,
      store_raw_text: input.store_raw_text,
      retention_days: input.retention_days,
      created_at: new Date().toISOString(),
      api_key_prefix: `pw_live_${Math.random().toString(16).slice(2, 6)}`,
      active_policy_version: 1,
    };
    PROJECTS.push(project);
    return { project, apiKey: `pw_live_${crypto.randomUUID().replace(/-/g, "")}` };
  },

  async listKeys(projectId?: string): Promise<ApiKey[]> {
    await latency(140);
    return API_KEYS.filter((k) => !projectId || k.project_id === projectId).sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  },

  async createKey(projectId: string, label: string): Promise<{ key: ApiKey; secret: string }> {
    await latency(300);
    const key: ApiKey = {
      id: `key_${crypto.randomUUID().slice(0, 12)}`,
      project_id: projectId,
      label,
      created_at: new Date().toISOString(),
      last_used_at: null,
      revoked_at: null,
    };
    API_KEYS.push(key);
    return { key, secret: `pw_live_${crypto.randomUUID().replace(/-/g, "")}` };
  },

  async revokeKey(id: string): Promise<void> {
    await latency(260);
    const key = API_KEYS.find((k) => k.id === id);
    if (!key) throw new Error("Key not found.");
    key.revoked_at = new Date().toISOString();
  },

  async listAlerts(): Promise<Alert[]> {
    await latency(140);
    return ALERTS.map((a) => ({ ...a }));
  },

  async markAlertRead(id: string): Promise<void> {
    const alert = ALERTS.find((a) => a.id === id);
    if (alert) alert.read = true;
  },

  async markAllAlertsRead(): Promise<void> {
    ALERTS.forEach((a) => {
      a.read = true;
    });
  },

  async listEvaluationRuns(): Promise<EvaluationRun[]> {
    await latency(160);
    return EVALUATION_RUNS.map((r) => ({ ...r }));
  },

  async health(): Promise<{ status: string; db: string; version: string }> {
    await latency(90);
    return { status: "ok", db: "connected", version: "0.1.0-week1" };
  },

  async projectName(projectId: string): Promise<string> {
    return projectName(projectId);
  },
};

export const categoryLabel = (category: string) =>
  CATEGORY_META[category as keyof typeof CATEGORY_META]?.label ?? category;

export type { SecurityEvent };
