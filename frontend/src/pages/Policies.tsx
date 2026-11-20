import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, FileCode2, History, Lock, Save, ShieldAlert, SlidersHorizontal, Wrench } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspace } from "../context/workspace";
import {
  Button,
  CodeBlock,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Modal,
  PageHeader,
  Panel,
  PanelHeader,
  Skeleton,
  StatusBadge,
  Tabs,
  TextArea,
  TextInput,
  UnsupportedNote,
  useToast,
} from "../components/ui";
import { cn, formatDateTime } from "../lib/utils";
import { TOOL_POLICIES } from "../lib/mock";
import type { FailMode, Mode } from "../types";

type Tab = "form" | "yaml" | "history";

const MODES: { id: Mode; label: string; description: string }[] = [
  {
    id: "strict",
    label: "Strict",
    description: "Lowest thresholds. More requests sanitized or blocked. Best for high-risk or public-facing agents.",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Default posture. Blocks clear injections, sanitizes suspicious spans, allows ordinary traffic.",
  },
  {
    id: "lenient",
    label: "Lenient",
    description: "Highest thresholds. Fewer interruptions, weaker protection. Only for low-impact internal tools.",
  },
];

const FAIL_MODES: { id: FailMode; label: string; description: string; tone: string }[] = [
  {
    id: "closed",
    label: "Fail closed",
    description: "If inspection or the audit write fails, return an error and do not forward the request.",
    tone: "border-success/30",
  },
  {
    id: "open",
    label: "Fail open",
    description: "Forward uninspected, flagged with X-PromptWall-Inspected: uninspected. Visible, but unprotected.",
    tone: "border-warning/30",
  },
];

export default function PoliciesPage() {
  const { projectId, project } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("form");
  const [mode, setMode] = useState<Mode>(project?.mode ?? "balanced");
  const [failMode, setFailMode] = useState<FailMode>(project?.fail_mode ?? "closed");
  const [low, setLow] = useState("0.45");
  const [high, setHigh] = useState("0.70");
  const [refusal, setRefusal] = useState("");
  const [placeholder, setPlaceholder] = useState("[REMOVED BY PROMPTWALL]");
  const [yaml, setYaml] = useState("");
  const [yamlError, setYamlError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const policy = useQuery({
    queryKey: ["policy", projectId],
    queryFn: () => api.getPolicy(projectId),
    enabled: projectId !== "all",
  });

  useEffect(() => {
    if (!policy.data) return;
    setMode(policy.data.mode);
    setFailMode(policy.data.fail_mode);
    setLow(policy.data.thresholds.low.toFixed(2));
    setHigh(policy.data.thresholds.high.toFixed(2));
    setRefusal(policy.data.refusal_text);
    setPlaceholder(policy.data.sanitize_placeholder);
    setYaml(policy.data.yaml);
  }, [policy.data]);

  const composeYaml = () =>
    [
      `# PromptWall project policy — ${project?.name ?? "project"}`,
      `version: ${(policy.data?.version ?? 0) + 1}`,
      `mode: ${mode}`,
      `refusal_text: ${JSON.stringify(refusal)}`,
      `sanitize_placeholder: ${JSON.stringify(placeholder)}`,
      `thresholds:`,
      `  low: ${Number(low).toFixed(2)}`,
      `  high: ${Number(high).toFixed(2)}`,
      "",
    ].join("\n");

  const save = useMutation({
    mutationFn: () =>
      api.savePolicy(projectId, {
        mode,
        fail_mode: failMode,
        thresholds: { low: Number(low), high: Number(high) },
        yaml: tab === "yaml" ? yaml : composeYaml(),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["policy", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      setConfirmOpen(false);
      setAcknowledged(false);
      toast({
        title: `Policy v${updated.version} saved`,
        description: "Subsequent requests use the new version. Existing audit records keep their original policy version.",
        variant: "success",
      });
    },
  });

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    const lowValue = Number(low);
    const highValue = Number(high);
    if (!Number.isFinite(lowValue) || lowValue < 0 || lowValue > 1) errors.low = "Enter a number between 0 and 1.";
    if (!Number.isFinite(highValue) || highValue < 0 || highValue > 1) errors.high = "Enter a number between 0 and 1.";
    if (!errors.low && !errors.high && lowValue >= highValue) errors.high = "The high threshold must be greater than the low threshold.";
    if (!refusal.trim()) errors.refusal = "A refusal message is required.";
    if (!placeholder.trim()) errors.placeholder = "A sanitize placeholder is required.";
    return errors;
  }, [low, high, refusal, placeholder]);

  const dirty =
    policy.data !== undefined &&
    (mode !== policy.data.mode ||
      failMode !== policy.data.fail_mode ||
      Number(low) !== policy.data.thresholds.low ||
      Number(high) !== policy.data.thresholds.high ||
      refusal !== policy.data.refusal_text ||
      placeholder !== policy.data.sanitize_placeholder ||
      yaml !== policy.data.yaml);

  const validateYaml = () => {
    if (!/^mode:\s*(strict|balanced|lenient)\s*$/m.test(yaml)) {
      setYamlError("YAML must include mode: strict | balanced | lenient.");
      return false;
    }
    if (!/^version:\s*\d+\s*$/m.test(yaml)) {
      setYamlError("YAML must include a numeric version.");
      return false;
    }
    setYamlError("");
    return true;
  };

  if (projectId === "all") {
    return (
      <div>
        <PageHeader
          title="Policies"
          description="Security behavior is configured per project."
          eyebrow={<><SlidersHorizontal className="h-3 w-3" /> Enforcement configuration</>}
        />
        <Panel>
          <EmptyState
            icon={<Lock className="h-5 w-5" />}
            title="Select a project to view its policy"
            description="Policies are scoped to a protected application. Use the project selector in the top bar, then return here."
          />
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={<><SlidersHorizontal className="h-3 w-3" /> Enforcement configuration</>}
        title="Policies"
        description={`Detection thresholds, enforcement mode and failure behavior for ${project?.name ?? "this project"}.`}
        actions={
          <>
            {policy.data ? (
              <span className="chip">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                v{policy.data.version} active
              </span>
            ) : null}
            <Button
              variant="primary"
              onClick={() => {
                if (tab === "yaml" && !validateYaml()) return;
                setAcknowledged(false);
                setConfirmOpen(true);
              }}
              disabled={!dirty || Object.keys(validation).length > 0 || save.isPending}
            >
              <Save className="h-3.5 w-3.5" /> Save policy
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Active version", policy.data ? `v${policy.data.version}` : "—"],
          ["Status", policy.data?.active ? "Active" : "—"],
          ["Last updated", policy.data ? formatDateTime(policy.data.updated_at) : "—"],
          ["Mode", mode],
        ].map(([label, value]) => (
          <div key={label} className="panel px-4 py-3">
            <p className="text-2xs uppercase tracking-[0.08em] text-ink-muted">{label}</p>
            <p className="mt-1 font-mono text-sm text-ink">{value}</p>
          </div>
        ))}
      </div>

      <Tabs
        tabs={[
          { id: "form", label: "Configuration" },
          { id: "yaml", label: "YAML" },
          { id: "history", label: "Version history", count: policy.data?.history.length },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {policy.isError ? (
        <Panel>
          <ErrorState onRetry={() => policy.refetch()} />
        </Panel>
      ) : policy.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : tab === "form" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Panel>
              <PanelHeader
                title="Security mode"
                subtitle="Preset thresholds. The backend applies the mode stored on the project."
              />
              <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-3">
                {MODES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMode(option.id)}
                    aria-pressed={mode === option.id}
                    className={cn(
                      "rounded-md border p-3 text-left transition-colors",
                      mode === option.id
                        ? "border-accent/50 bg-accent/[0.07] shadow-glow"
                        : "border-line bg-overlay/40 hover:border-line-strong",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize text-ink">{option.label}</span>
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full border",
                          mode === option.id ? "border-accent bg-accent text-base" : "border-line-strong",
                        )}
                      >
                        {mode === option.id ? <Check className="h-2.5 w-2.5" /> : null}
                      </span>
                    </div>
                    <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">{option.description}</p>
                  </button>
                ))}
              </div>
              <div className="border-t border-line px-4 py-2.5">
                <UnsupportedNote>
                  Week 1 detail: the decision engine reads the project&apos;s mode column. Editing{" "}
                  <span className="font-mono">mode</span> in policy YAML alone does not change enforcement
                  until the project is updated.
                </UnsupportedNote>
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="Decision thresholds"
                subtitle="Risk score at which sanitize and block apply for standard-trust user messages"
              />
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                <Field
                  label="Low threshold (sanitize)"
                  htmlFor="threshold-low"
                  error={validation.low}
                  hint="Scores at or above this value trigger sanitization when spans exist."
                >
                  <TextInput
                    id="threshold-low"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={low}
                    onChange={(e) => setLow(e.target.value)}
                    className="font-mono"
                  />
                </Field>
                <Field
                  label="High threshold (block)"
                  htmlFor="threshold-high"
                  error={validation.high}
                  hint="Scores at or above this value block standard-trust messages."
                >
                  <TextInput
                    id="threshold-high"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={high}
                    onChange={(e) => setHigh(e.target.value)}
                    className="font-mono"
                  />
                </Field>
              </div>
              <div className="border-t border-line px-4 py-2.5 text-2xs text-ink-faint">
                External channels (retrieved documents, tool outputs) use a lower threshold. System
                messages are inspected but never rewritten. Values shown here are the project&apos;s stored
                overrides, not invented presets.
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Failure behavior" subtitle="What happens when inspection or audit cannot complete" />
              <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                {FAIL_MODES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFailMode(option.id)}
                    aria-pressed={failMode === option.id}
                    className={cn(
                      "rounded-md border p-3 text-left transition-colors",
                      failMode === option.id
                        ? `${option.tone} bg-raised`
                        : "border-line bg-overlay/40 hover:border-line-strong",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{option.label}</span>
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full",
                          option.id === "closed" ? "bg-success" : "bg-warning",
                          failMode === option.id ? "opacity-100" : "opacity-40",
                        )}
                      />
                    </div>
                    <p className="mt-1.5 text-2xs leading-relaxed text-ink-muted">{option.description}</p>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Response text" subtitle="What the caller and the model see" />
              <div className="space-y-4 p-4">
                <Field
                  label="Refusal message"
                  htmlFor="refusal"
                  error={validation.refusal}
                  hint="Returned as the assistant message with finish_reason=content_filter."
                >
                  <TextArea
                    id="refusal"
                    value={refusal}
                    onChange={(e) => setRefusal(e.target.value)}
                    maxLength={500}
                    className="min-h-16 text-sm"
                  />
                </Field>
                <Field
                  label="Sanitize placeholder"
                  htmlFor="placeholder"
                  error={validation.placeholder}
                  hint="Inserted in place of a detected span. Original text is never overwritten in storage."
                >
                  <TextInput
                    id="placeholder"
                    value={placeholder}
                    onChange={(e) => setPlaceholder(e.target.value)}
                    maxLength={80}
                    className="font-mono text-sm"
                  />
                </Field>
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel>
              <PanelHeader
                title="Tool policies"
                subtitle="Allow / deny / require approval"
                actions={<span className="chip text-2xs">proposed</span>}
              />
              <div className="divide-y divide-line/60">
                {TOOL_POLICIES.map((tool) => (
                  <div key={tool.tool} className="flex items-center gap-2 px-4 py-2.5">
                    <Wrench className="h-3 w-3 shrink-0 text-ink-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-ink-secondary">{tool.tool}</p>
                      <p className="text-2xs text-ink-faint">{tool.note}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-2xs",
                        tool.action === "deny"
                          ? "border-danger/25 bg-danger/[0.07] text-danger"
                          : tool.action === "require_approval"
                            ? "border-warning/25 bg-warning/[0.07] text-warning"
                            : "border-success/25 bg-success/[0.07] text-success",
                      )}
                    >
                      {tool.action.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-line px-4 py-3">
                <UnsupportedNote>
                  Tool-call authorization is not enforced by the Week 1 backend. These rows describe the
                  intended policy and are read-only until the tool gate ships. Approving a call in this
                  console cannot execute it.
                </UnsupportedNote>
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="What this policy protects" />
              <div className="space-y-2 px-4 py-3 text-2xs leading-relaxed text-ink-muted">
                <p className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-success/70" /> Request-side detection with
                  normalization and span sanitization.
                </p>
                <p className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-success/70" /> Transactional audit before
                  forwarding or refusing.
                </p>
                <p className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/70" /> It does not stop an
                  application from ignoring the gateway.
                </p>
                <p className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning/70" /> No prompt-injection
                  detector is complete. See documentation for limits.
                </p>
              </div>
            </Panel>
          </div>
        </div>
      ) : tab === "yaml" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Policy document"
              subtitle="Advanced editing. The backend validates the YAML before activation."
              actions={<span className="chip text-2xs"><FileCode2 className="h-3 w-3" /> YAML</span>}
            />
            <div className="space-y-2 p-4">
              <TextArea
                value={yaml}
                onChange={(e) => {
                  setYaml(e.target.value);
                  setYamlError("");
                }}
                spellCheck={false}
                className="min-h-[360px] font-mono text-xs leading-relaxed"
                aria-label="Policy YAML"
              />
              {yamlError ? <InlineError>{yamlError}</InlineError> : null}
              <div className="flex items-center justify-between">
                <p className="text-2xs text-ink-faint">
                  Editing mode here updates the document. Save still requires confirmation.
                </p>
                <Button size="sm" onClick={validateYaml}>
                  Validate
                </Button>
              </div>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Current active version" />
            <div className="p-4">
              <CodeBlock code={policy.data?.yaml ?? ""} language="yaml" maxHeight="360px" />
            </div>
          </Panel>
        </div>
      ) : (
        <Panel>
          <PanelHeader title="Version history" subtitle="Each saved policy becomes an immutable version" />
          {policy.data && policy.data.history.length > 0 ? (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Created</th>
                  <th>Author</th>
                  <th>Mode</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {policy.data.history.map((version) => (
                  <tr key={version.version}>
                    <td className="font-mono text-xs text-ink">v{version.version}</td>
                    <td className="text-xs text-ink-muted">{formatDateTime(version.created_at)}</td>
                    <td className="text-xs">{version.created_by}</td>
                    <td className="text-xs capitalize">{version.mode}</td>
                    <td>
                      {version.active ? (
                        <StatusBadge value="active" />
                      ) : (
                        <span className="text-2xs text-ink-faint">superseded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={<History className="h-5 w-5" />} title="No policy versions recorded" />
          )}
          <div className="border-t border-line px-4 py-3">
            <UnsupportedNote>
              Rollback and diff are not offered because the current backend has no endpoint for them.
              Creating a new version is the supported path.
            </UnsupportedNote>
          </div>
        </Panel>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Activate a new policy version?"
        description="This affects every subsequent request for this project."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!acknowledged || save.isPending || Object.keys(validation).length > 0}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Activate policy"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-md border border-line bg-overlay/40 p-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <span className="text-ink-muted">Mode</span>
              <span className="text-right capitalize text-ink">{mode}</span>
              <span className="text-ink-muted">Fail mode</span>
              <span className="text-right capitalize text-ink">{failMode}</span>
              <span className="text-ink-muted">Thresholds</span>
              <span className="text-right font-mono text-ink">
                {Number(low).toFixed(2)} / {Number(high).toFixed(2)}
              </span>
              <span className="text-ink-muted">Next version</span>
              <span className="text-right font-mono text-ink">v{(policy.data?.version ?? 0) + 1}</span>
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-warning/90">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Existing audit records keep their original policy version. New decisions use this version
            immediately.
          </p>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-ink-secondary">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-cyan-400"
            />
            I understand this changes enforcement for subsequent requests and that thresholds are
            provisional until calibration.
          </label>
        </div>
      </Modal>
    </div>
  );
}
