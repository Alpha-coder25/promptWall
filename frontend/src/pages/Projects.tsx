import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  FolderKanban,
  KeyRound,
  Plus,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { api } from "../lib/api";
import { useWorkspace } from "../context/workspace";
import {
  Button,
  CodeBlock,
  CopyButton,
  ErrorState,
  Field,
  Modal,
  PageHeader,
  Panel,
  SelectInput,
  Skeleton,
  TextInput,
  Toggle,
  useToast,
} from "../components/ui";
import { cn, formatDate, formatNumber } from "../lib/utils";
import { EVENTS } from "../lib/mock";
import type { FailMode, Mode, Project } from "../types";

const MODE_ICON = { strict: ShieldAlert, balanced: ShieldCheck, lenient: ShieldQuestion } as const;

function ProjectCard({
  project,
  selected,
  onSelect,
  onEvents,
}: {
  project: Project;
  selected: boolean;
  onSelect: () => void;
  onEvents: () => void;
}) {
  const requestCount = EVENTS.filter((e) => e.project_id === project.id).length;
  const blocked = EVENTS.filter((e) => e.project_id === project.id && e.decision === "block").length;
  const ModeIcon = MODE_ICON[project.mode];

  return (
    <div
      className={cn(
        "panel flex flex-col p-4 transition-colors",
        selected ? "border-accent/40 shadow-glow" : "hover:border-line-strong",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-raised text-ink-secondary">
          <FolderKanban className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-ink">{project.name}</h2>
            {selected ? (
              <span className="flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-2xs text-accent">
                <Check className="h-2.5 w-2.5" /> selected
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-2 text-2xs leading-relaxed text-ink-muted">
            {project.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded border border-line bg-raised px-1.5 py-0.5 text-2xs capitalize text-ink-secondary">
          <ModeIcon className="h-3 w-3" /> {project.mode}
        </span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-2xs capitalize",
            project.fail_mode === "closed"
              ? "border-success/25 bg-success/[0.07] text-success"
              : "border-warning/25 bg-warning/[0.07] text-warning",
          )}
        >
          fail {project.fail_mode}
        </span>
        <span className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-2xs text-ink-muted">
          policy v{project.active_policy_version}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-md border border-line bg-overlay/40 p-2.5">
        <div>
          <p className="font-mono text-sm text-ink">{formatNumber(requestCount)}</p>
          <p className="text-2xs text-ink-faint">requests</p>
        </div>
        <div>
          <p className="font-mono text-sm text-danger">{blocked}</p>
          <p className="text-2xs text-ink-faint">blocked</p>
        </div>
        <div>
          <p className="font-mono text-sm text-ink-secondary">{project.retention_days}d</p>
          <p className="text-2xs text-ink-faint">retention</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
        <span className="font-mono text-2xs text-ink-faint">
          {project.api_key_prefix}•••• · {formatDate(project.created_at)}
        </span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onEvents}>
            Events
          </Button>
          {selected ? (
            <Button size="sm" disabled>
              Selected
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={onSelect}>
              Select
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { projectId, setProjectId } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("balanced");
  const [failMode, setFailMode] = useState<FailMode>("closed");
  const [retention, setRetention] = useState("30");
  const [storeRaw, setStoreRaw] = useState(false);
  const [error, setError] = useState("");
  const [createdSecret, setCreatedSecret] = useState<{ name: string; secret: string; id: string } | null>(null);

  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const create = useMutation({
    mutationFn: () =>
      api.createProject({
        name: name.trim(),
        mode,
        fail_mode: failMode,
        store_raw_text: storeRaw,
        retention_days: Number(retention),
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setCreateOpen(false);
      setCreatedSecret({ name: result.project.name, secret: result.apiKey, id: result.project.id });
      setProjectId(result.project.id);
      setName("");
      setError("");
      toast({ title: "Project created", description: "Store the API key now — it is shown once.", variant: "success" });
    },
    onError: (err: Error) => setError(err.message),
  });

  const submit = () => {
    if (name.trim().length < 2) {
      setError("Project name must be at least 2 characters.");
      return;
    }
    if (!/^\d+$/.test(retention) || Number(retention) < 1 || Number(retention) > 365) {
      setError("Retention must be between 1 and 365 days.");
      return;
    }
    create.mutate();
  };

  const integrationSnippet = `from openai import OpenAI

client = OpenAI(
    base_url="${window.location.origin.replace(/\/$/, "")}/v1",  # replace with your gateway URL
    api_key="${createdSecret?.secret ?? "pw_live_..."}",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello"}],
)`;

  return (
    <div>
      <PageHeader
        eyebrow={<><FolderKanban className="h-3 w-3" /> Protected applications</>}
        title="Projects"
        description="Each project is one protected application with its own keys, policy and audit scope. Metrics elsewhere in the console are filtered by the selected project."
        actions={
          <>
            <Button onClick={() => navigate("/keys")}>
              <KeyRound className="h-3.5 w-3.5" /> API keys
            </Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New project
            </Button>
          </>
        }
      />

      {projects.isError ? (
        <Panel>
          <ErrorState onRetry={() => projects.refetch()} />
        </Panel>
      ) : projects.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(projects.data ?? []).map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              selected={project.id === projectId}
              onSelect={() => {
                setProjectId(project.id);
                toast({ title: `Scope set to ${project.name}`, variant: "info" });
              }}
              onEvents={() => navigate("/events")}
            />
          ))}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[230px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-ink-faint transition-colors hover:border-accent/30 hover:text-ink-muted"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface">
              <Plus className="h-4 w-4" />
            </span>
            <span className="text-xs">Protect another application</span>
          </button>
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-2xs text-ink-faint">
        <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0" />
        Request counts are derived from fixture events. In live mode, the backend needs a per-project
        count endpoint or aggregation query — see frontend/README.md.
      </p>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create project"
        description="A project scopes API keys, policy and audit records to one application."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create project"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Project name" htmlFor="project-name" hint="Shown throughout the console.">
            <TextInput
              id="project-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="Customer support agent"
              maxLength={80}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Security mode" htmlFor="project-mode">
              <SelectInput id="project-mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
                <option value="lenient">Lenient</option>
              </SelectInput>
            </Field>
            <Field label="Failure mode" htmlFor="project-fail">
              <SelectInput
                id="project-fail"
                value={failMode}
                onChange={(e) => setFailMode(e.target.value as FailMode)}
              >
                <option value="closed">Fail closed</option>
                <option value="open">Fail open</option>
              </SelectInput>
            </Field>
          </div>
          <Field
            label="Retention (days)"
            htmlFor="project-retention"
            hint="How long audit records are kept. The backend stores this value; a retention job is not implemented yet."
          >
            <TextInput
              id="project-retention"
              type="number"
              min={1}
              max={365}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              className="font-mono"
            />
          </Field>
          <div className="flex items-start justify-between gap-4 rounded-md border border-line bg-overlay/40 px-3 py-2.5">
            <div>
              <p className="text-xs font-medium text-ink">Store raw prompt text</p>
              <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">
                Off by default. When on, messages are revealed in event details to authorized reviewers.
                Hashes and redacted evidence are always stored.
              </p>
            </div>
            <Toggle checked={storeRaw} onChange={setStoreRaw} label="Store raw prompt text" />
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </Modal>

      <Modal
        open={createdSecret !== null}
        onClose={() => setCreatedSecret(null)}
        title="Store this API key now"
        description="The full secret is shown once. Only a hash is stored server-side."
        width="lg"
        footer={
          <Button variant="primary" onClick={() => setCreatedSecret(null)}>
            I stored the key
          </Button>
        }
      >
        {createdSecret ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-md border border-warning/25 bg-warning/[0.06] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-2xs uppercase tracking-wider text-warning/80">Project key · {createdSecret.name}</p>
                <p className="mt-1 break-all font-mono text-xs text-ink">{createdSecret.secret}</p>
              </div>
              <CopyButton value={createdSecret.secret} label="Copy key" />
            </div>
            <p className="text-xs text-ink-muted">
              This is the PromptWall project key, not your upstream provider key. Keep the provider key in
              the gateway&apos;s environment.
            </p>
            <CodeBlock code={integrationSnippet} language="python" maxHeight="230px" />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
