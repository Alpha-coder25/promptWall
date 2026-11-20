/**
 * Frontend types mirror the Week 1 backend where the contract exists.
 * Fields marked "proposed" are not returned by the current backend and are
 * supplied by the fixture layer until the API is extended.
 */

export type Mode = "strict" | "balanced" | "lenient";
export type FailMode = "open" | "closed";
export type Decision = "allow" | "sanitize" | "block";
export type InspectionStatus = "inspected" | "uninspected";
export type Severity = "low" | "medium" | "high" | "critical";
export type Channel = "system" | "user" | "assistant" | "retrieved_document" | "tool_output";
export type DetectionLayer = "normalization" | "heuristic" | "classifier" | "judge";
export type Category =
  | "INSTRUCTION_OVERRIDE"
  | "ROLE_INJECTION"
  | "PROMPT_LEAKAGE"
  | "DELIMITER_ABUSE"
  | "DATA_EXFILTRATION"
  | "ENCODED_PAYLOAD";
export type SessionStatus = "normal" | "watched" | "quarantined";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type ToolPolicyAction = "allow" | "deny" | "require_approval";

export interface Project {
  id: string;
  name: string;
  description: string;
  mode: Mode;
  fail_mode: FailMode;
  store_raw_text: boolean;
  retention_days: number;
  created_at: string;
  api_key_prefix: string;
  active_policy_version: number;
}

export interface ApiKey {
  id: string;
  project_id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface Policy {
  version: number;
  project_id: string;
  mode: Mode;
  fail_mode: FailMode;
  thresholds: { low: number; high: number };
  refusal_text: string;
  sanitize_placeholder: string;
  updated_at: string;
  updated_by: string;
  active: boolean;
  yaml: string;
  history: PolicyVersion[];
}

export interface PolicyVersion {
  version: number;
  created_at: string;
  created_by: string;
  mode: Mode;
  active: boolean;
}

export interface EvidenceSpan {
  start: number;
  end: number;
  preview: string;
}

export interface Detection {
  id: string;
  category: Category;
  layer: DetectionLayer;
  score: number;
  span: EvidenceSpan | null;
  detail: string;
}

export interface MessageInspection {
  position: number;
  role: "system" | "user" | "assistant" | "tool";
  channel: Channel;
  trust_level: "trusted" | "standard" | "untrusted";
  label_source: "default" | "application" | "gateway" | "pinned";
  flags: string[];
  redacted_text: string;
  sanitized_text: string | null;
  original_text: string | null;
  raw_retained: boolean;
}

export interface SecurityEvent {
  id: string;
  request_id: string;
  session_id: string;
  project_id: string;
  created_at: string;
  decision: Decision;
  final_score: number;
  inspection_status: InspectionStatus;
  latency_ms: number;
  policy_version: number;
  content_hash: string;
  detections: Detection[];
  messages: MessageInspection[];
  explanation: {
    summary: string;
    signals: string[];
    policy_applied: string;
    session_influence: string | null;
    forwarded: boolean;
  };
}

export interface Session {
  id: string;
  project_id: string;
  started_at: string;
  last_activity: string;
  request_count: number;
  risk_score: number;
  status: SessionStatus;
  channel_counts: Record<Channel, number>;
}

export interface ToolCall {
  id: string;
  tool_name: string;
  args: Record<string, unknown>;
  args_hash: string;
  proposed_at: string;
  execution_status: "pending" | "executed" | "denied" | "awaiting_approval";
}

export interface Approval {
  id: string;
  tool_name: string;
  project_id: string;
  session_id: string;
  request_id: string;
  risk_level: Severity;
  created_at: string;
  status: ApprovalStatus;
  args: Record<string, unknown>;
  args_hash: string;
  explanation: string;
  untrusted_context: boolean;
  policy_rule: string;
  signals: string[];
  decided_by: string | null;
  decided_at: string | null;
  execution_status: "not_started" | "pending_executor" | "executed" | "denied" | "expired";
}

export interface Alert {
  id: string;
  type: "repeated_attacks" | "high_risk_session" | "tool_activity" | "policy" | "system_health";
  severity: Severity;
  title: string;
  description: string;
  created_at: string;
  read: boolean;
  event_id: string | null;
  session_id: string | null;
}

export interface CategoryMetric {
  category: Category;
  recall: number;
  support: number;
}

export interface EvaluationRun {
  id: string;
  dataset: string;
  dataset_version: string;
  dataset_license: string;
  created_at: string;
  config_snapshot: string;
  total_cases: number;
  recall_at_1pct_fpr: number;
  fpr_hard_negatives: number;
  latency_p50: number;
  latency_p95: number;
  judge_rate: number;
  adaptive_asr: number | null;
  status: "completed" | "running" | "failed";
  per_category: CategoryMetric[];
}

export interface OverviewMetrics {
  totalRequests: number;
  threats: number;
  blocked: number;
  sanitized: number;
  allowed: number;
  avgLatency: number;
  p95Latency: number;
  previous: { totalRequests: number; threats: number } | null;
}

export interface TimeSeriesPoint {
  bucket: string;
  allowed: number;
  sanitized: number;
  blocked: number;
}

export interface OverviewData {
  metrics: OverviewMetrics;
  series: TimeSeriesPoint[];
  decisionCounts: Record<Decision, number>;
  threatCounts: { category: Category; count: number }[];
  recentEvents: SecurityEvent[];
  highRiskSessions: Session[];
  pendingApprovals: number;
  uninspected: number;
}

export interface DashboardFilters {
  projectId: string;
  days: number;
}
