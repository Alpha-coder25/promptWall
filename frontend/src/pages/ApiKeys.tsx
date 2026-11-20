import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  Terminal,
  Trash2,
} from "lucide-react";
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
  TextInput,
  useToast,
} from "../components/ui";
import { cn, formatDateTime, timeAgo } from "../lib/utils";

const SNIPPETS = {
  python: `from openai import OpenAI

client = OpenAI(
    base_url="https://YOUR_GATEWAY/v1",
    api_key="pw_live_...",  # PromptWall project key
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Summarize this ticket"}],
)`,
  node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://YOUR_GATEWAY/v1",
  apiKey: "pw_live_...", // PromptWall project key
});

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Summarize this ticket" }],
});`,
  curl: `curl https://YOUR_GATEWAY/v1/chat/completions \\
  -H "Authorization: Bearer pw_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Summarize this ticket"}]
  }'`,
};

type Lang = keyof typeof SNIPPETS;

export default function ApiKeysPage() {
  const { projectId, project } = useWorkspace();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; label: string } | null>(null);
  const [lang, setLang] = useState<Lang>("python");
  const [copiedSecret, setCopiedSecret] = useState(false);

  const keys = useQuery({
    queryKey: ["keys", projectId],
    queryFn: () => api.listKeys(projectId === "all" ? undefined : projectId),
    enabled: projectId !== "all",
  });

  const create = useMutation({
    mutationFn: () => api.createKey(projectId, label.trim()),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      setCreateOpen(false);
      setSecret({ label: result.key.label, value: result.secret });
      setLabel("");
      toast({ title: "API key generated", description: "Copy it now; it cannot be shown again.", variant: "success" });
    },
    onError: (err: Error) => setError(err.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      setRevokeTarget(null);
      toast({ title: "Key revoked", description: "Requests using this key now receive 401.", variant: "info" });
    },
    onError: (err: Error) => setError(err.message),
  });

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopiedSecret(true);
      window.setTimeout(() => setCopiedSecret(false), 1600);
    } catch {
      toast({ title: "Clipboard unavailable", description: "Select the key and copy it manually.", variant: "error" });
    }
  };

  if (projectId === "all") {
    return (
      <div>
        <PageHeader
          eyebrow={<><KeyRound className="h-3 w-3" /> Credentials</>}
          title="API Keys"
          description="Keys are scoped to a project."
        />
        <Panel>
          <EmptyState
            icon={<Lock className="h-5 w-5" />}
            title="Select a project to manage its keys"
            description="Use the project selector in the top bar. Keys from different projects never share scope."
          />
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow={<><KeyRound className="h-3 w-3" /> Credentials</>}
        title="API Keys"
        description={`Project keys for ${project?.name ?? "this project"}. These authenticate applications to PromptWall — they are not upstream provider credentials.`}
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Generate key
          </Button>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-md border border-info/20 bg-info/[0.05] px-3.5 py-2.5 text-xs leading-relaxed text-info/90">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          PromptWall stores only a SHA-256 hash of each key. A newly generated secret is displayed once.
          Never put upstream provider keys in application code — keep them in the gateway environment.
        </span>
      </div>

      <Panel>
        <PanelHeader
          title="Project keys"
          subtitle={`${keys.data?.filter((k) => !k.revoked_at).length ?? 0} active`}
          actions={
            <Button size="sm" onClick={() => keys.refetch()} disabled={keys.isFetching}>
              Refresh
            </Button>
          }
        />
        {keys.isError ? (
          <ErrorState onRetry={() => keys.refetch()} />
        ) : keys.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (keys.data ?? []).length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-5 w-5" />}
            title="No keys for this project"
            description="Generate a key, store it once, and configure the OpenAI SDK to use the gateway base URL."
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Generate key
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Key</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(keys.data ?? []).map((key) => (
                  <tr key={key.id} className={cn(key.revoked_at && "opacity-60")}>
                    <td className="text-xs font-medium text-ink">{key.label}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted">
                        <Lock className="h-3 w-3 text-ink-faint" />
                        {project?.api_key_prefix ?? "pw_live"}••••••••
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs text-ink-muted">{formatDateTime(key.created_at)}</td>
                    <td className="whitespace-nowrap text-xs text-ink-muted">
                      {key.last_used_at ? timeAgo(key.last_used_at) : "never"}
                    </td>
                    <td>
                      {key.revoked_at ? (
                        <span className="inline-flex items-center gap-1 rounded border border-danger/25 bg-danger/[0.07] px-2 py-0.5 text-xs text-danger">
                          revoked
                        </span>
                      ) : (
                        <StatusBadge value="active" />
                      )}
                    </td>
                    <td className="text-right">
                      {key.revoked_at ? (
                        <span className="text-2xs text-ink-faint">
                          {key.revoked_at ? formatDateTime(key.revoked_at) : ""}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setError("");
                            setRevokeTarget({ id: key.id, label: key.label });
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-4">
        <PanelHeader
          title="Integration"
          subtitle="Change the base URL; keep the same OpenAI-compatible call shape"
          actions={
            <Tabs
              tabs={[
                { id: "python", label: "Python" },
                { id: "node", label: "Node" },
                { id: "curl", label: "cURL" },
              ]}
              value={lang}
              onChange={(value) => setLang(value as Lang)}
              className="border-0"
            />
          }
        />
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CodeBlock code={SNIPPETS[lang]} language={lang === "curl" ? "bash" : lang} maxHeight="300px" />
          </div>
          <ol className="space-y-3">
            {[
              "Create a project and copy its project key once.",
              "Set base_url to the gateway's /v1 endpoint in your OpenAI client.",
              "Keep UPSTREAM_API_KEY on the gateway, never in the app.",
              "Send a test request, then confirm it appears in Security Events.",
            ].map((step, index) => (
              <li key={step} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-raised font-mono text-2xs text-accent">
                  {index + 1}
                </span>
                <span className="text-xs leading-relaxed text-ink-muted">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-2xs text-ink-faint">
          <Terminal className="h-3 w-3" />
          Unsupported by this gateway: provider-specific SDKs, streaming, and non-chat endpoints.
        </div>
      </Panel>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate API key"
        description="The secret is displayed once and never stored in plaintext."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (label.trim().length < 2) {
                  setError("Give the key a label of at least 2 characters.");
                  return;
                }
                create.mutate();
              }}
              disabled={create.isPending}
            >
              {create.isPending ? "Generating…" : "Generate key"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Key label" htmlFor="key-label" hint="For example: production, staging, ci.">
            <TextInput
              id="key-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setError("");
              }}
              placeholder="production"
              maxLength={60}
              autoFocus
            />
          </Field>
          <div className="rounded-md border border-line bg-overlay/40 px-3 py-2.5 text-2xs leading-relaxed text-ink-muted">
            The key will have full request scope for <span className="text-ink-secondary">{project?.name}</span>.
            It cannot be used for admin endpoints.
          </div>
          {error ? <InlineError>{error}</InlineError> : null}
        </div>
      </Modal>

      <Modal
        open={secret !== null}
        onClose={() => {
          setSecret(null);
          setCopiedSecret(false);
        }}
        title="Copy your new key now"
        description="For security, this secret cannot be retrieved again."
        width="md"
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setSecret(null);
              setCopiedSecret(false);
            }}
          >
            {copiedSecret ? "Done" : "I stored the key"}
          </Button>
        }
      >
        {secret ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-warning/25 bg-warning/[0.06] px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-2xs uppercase tracking-wider text-warning/80">{secret.label}</p>
                <p className="mt-1 break-all font-mono text-xs text-ink">{secret.value}</p>
              </div>
              <button
                type="button"
                onClick={copySecret}
                className="btn btn-sm shrink-0"
                aria-label="Copy API key"
              >
                {copiedSecret ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedSecret ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-warning/90">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Store this in a secret manager. If it leaks, revoke it immediately and issue a new key.
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="Revoke this API key?"
        description="Applications using it will receive 401 on their next request."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)} disabled={revoke.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => revokeTarget && revoke.mutate(revokeTarget.id)}
              disabled={revoke.isPending}
            >
              {revoke.isPending ? "Revoking…" : "Revoke key"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-secondary">
            Key <span className="font-mono text-ink">{revokeTarget?.label}</span> will stop authenticating
            immediately. There is no grace period in this backend.
          </p>
          <p className="flex items-start gap-1.5 text-xs text-warning/90">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This cannot be undone. Issue a replacement key before revoking a production credential.
          </p>
          {error ? <InlineError>{error}</InlineError> : null}
        </div>
      </Modal>
    </div>
  );
}
