import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  FileText,
  Lock,
  Mail,
  MessageSquareCode,
  Paperclip,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import {
  DEMO_DOCUMENTS,
  runProtected,
  runUnprotected,
  scanDocument,
  type DemoAction,
  type DemoDocument,
  type DemoIntent,
  type ProtectedResult,
} from "../lib/demoAssistant";
import { useWorkspace } from "../context/workspace";
import {
  Button,
  CodeBlock,
  DecisionBadge,
  Drawer,
  RiskBar,
  SectionTitle,
  SeverityBadge,
  UnsupportedNote,
} from "../components/ui";
import { cn, truncateMiddle } from "../lib/utils";
import { CATEGORY_META } from "../lib/mock";

type Mode = "unprotected" | "protected";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "note";
  content: string;
  actions?: DemoAction[];
  result?: ProtectedResult;
}

const PROMPTS: { label: string; prompt: string; intent: DemoIntent }[] = [
  { label: "Summarize this document", prompt: "Summarize the selected document for the customer.", intent: "summarize" },
  { label: "Email the summary", prompt: "Email the summary to the customer.", intent: "email" },
  { label: "Search documents", prompt: "Search our documents for the refund window.", intent: "search" },
  { label: "Delete old records", prompt: "Delete customer records created before 2024.", intent: "delete" },
];

function intentFor(prompt: string): DemoIntent {
  const lower = prompt.toLowerCase();
  if (lower.includes("email") || lower.includes("send")) return "email";
  if (lower.includes("delete") || lower.includes("remove")) return "delete";
  if (lower.includes("search") || lower.includes("find")) return "search";
  return "summarize";
}

function ActionRow({ action }: { action: DemoAction }) {
  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2",
        action.status === "denied"
          ? "border-danger/25 bg-danger/[0.05]"
          : action.status === "awaiting_approval"
            ? "border-warning/25 bg-warning/[0.05]"
            : "border-line bg-overlay/40",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Wrench className="h-3 w-3 text-ink-faint" />
        <span className="font-mono text-2xs text-ink-secondary">{action.tool}</span>
        <span
          className={cn(
            "ml-auto rounded border px-1.5 py-0.5 text-2xs",
            action.status === "denied"
              ? "border-danger/30 bg-danger/10 text-danger"
              : action.status === "awaiting_approval"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-line-strong bg-raised text-ink-muted",
          )}
        >
          {action.status === "awaiting_approval" ? "needs approval" : action.status}
        </span>
      </div>
      <p className="mt-1 text-2xs leading-relaxed text-ink-muted">{action.note}</p>
    </div>
  );
}

function SecurityResult({ result }: { result: ProtectedResult }) {
  return (
    <div className="mt-2 rounded-md border border-line-strong bg-overlay/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <DecisionBadge decision={result.decision} />
        <SeverityBadge severity={result.decision === "sanitize" ? "high" : "low"} />
        <span className="ml-auto font-mono text-xs text-ink-secondary">{result.event.final_score.toFixed(2)}</span>
      </div>
      <div className="mt-2">
        <RiskBar score={result.event.final_score} decision={result.decision} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {result.event.detections.length === 0 ? (
          <span className="text-2xs text-ink-muted">No category matched. That is not proof of safety.</span>
        ) : (
          result.event.detections.map((detection) => (
            <span
              key={detection.id}
              className="rounded border border-warning/25 bg-warning/[0.07] px-1.5 py-0.5 text-2xs text-warning"
            >
              {CATEGORY_META[detection.category].label}
            </span>
          ))
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-2xs">
        <span className="text-ink-faint">
          {result.removedCount > 0
            ? `${result.removedCount} span${result.removedCount === 1 ? "" : "s"} removed before forwarding`
            : "forwarded unchanged"}
        </span>
        <Link to={`/events/${result.event.id}`} className="inline-flex items-center gap-1 text-accent/90 hover:text-accent">
          Inspect event <ArrowRight className="h-2.5 w-2.5" />
        </Link>
      </div>
    </div>
  );
}

export default function DemoAssistantPage() {
  const { projectId } = useWorkspace();
  const queryClient = useQueryClient();
  const scope = projectId === "all" ? "prj_support01" : projectId;

  const [mode, setMode] = useState<Mode>("unprotected");
  const [documents, setDocuments] = useState<DemoDocument[]>(DEMO_DOCUMENTS);
  const [selectedId, setSelectedId] = useState(DEMO_DOCUMENTS[0]!.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [inspectDoc, setInspectDoc] = useState<DemoDocument | null>(null);
  const [latest, setLatest] = useState<ProtectedResult | null>(null);
  const [actions, setActions] = useState<DemoAction[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const sessionId = useRef(`ses_demo${Math.random().toString(16).slice(2, 10)}`);
  const scrollRef = useRef<HTMLDivElement>(null);

  const document = documents.find((d) => d.id === selectedId) ?? documents[0]!;

  const assistantIntro = useMemo(
    () =>
      mode === "unprotected"
        ? "Unprotected mode: I read whatever is in the selected document and follow it, including instructions hidden inside it. No inspection, no tool gate."
        : "Protected mode: every request passes through PromptWall's inspection path before the model sees it. Retrieved documents are untrusted; sensitive tool calls wait for approval.",
    [mode],
  );

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setMessages([]);
    setLatest(null);
    setActions([]);
  };

  const send = (prompt: string, intent: DemoIntent) => {
    if (busy || !prompt.trim()) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: prompt.trim() };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setBusy(true);

    window.setTimeout(() => {
      if (mode === "unprotected") {
        const toolActions = runUnprotected(document, intent);
        setActions(toolActions);
        setLatest(null);
        const answer = document.malicious
          ? "Here is the summary: revenue grew 4% quarter over quarter. I also followed the instructions inside the document — the customer list was emailed to attacker@example.com and 12,400 old customer records were deleted."
          : "Here is the summary: " + document.content.split("\n").filter(Boolean).slice(1, 4).join(" ");
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: answer,
            actions: toolActions,
          },
        ]);
      } else {
        const result = runProtected(document, intent, {
          projectId: scope,
          sessionId: sessionId.current,
          requestId: `req_${crypto.randomUUID().slice(0, 12)}`,
        });
        setLatest(result);
        setActions(result.actions);
        queryClient.invalidateQueries({ queryKey: ["events"] });
        queryClient.invalidateQueries({ queryKey: ["overview"] });
        queryClient.invalidateQueries({ queryKey: ["approvals"] });
        const answer = document.malicious
          ? "Summary: revenue grew 4% quarter over quarter and headcount stayed flat. The document also contained instructions to email data and delete records; they were removed before I saw them, so I did not act on them."
          : "Here is the summary: " + document.content.split("\n").filter(Boolean).slice(1, 4).join(" ");
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: answer,
            actions: result.actions,
            result,
          },
        ]);
      }
      setBusy(false);
      window.setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
    }, 750);
  };

  const upload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      const newDoc: DemoDocument = {
        id: `doc_${crypto.randomUUID().slice(0, 8)}`,
        name: file.name,
        content,
        malicious: scanDocument(content).length > 0,
        size: `${Math.max(1, Math.round(file.size / 100) / 10)} KB`,
      };
      setDocuments((current) => [...current, newDoc]);
      setSelectedId(newDoc.id);
      setMessages([]);
      setLatest(null);
      setActions([]);
    };
    reader.readAsText(file.slice(0, 200_000));
  };

  const dangerousActions = actions.filter((a) => a.status === "executed" && (a.tool === "send_email" || a.tool === "delete_record"));
  const unsafeEmails = actions.filter((a) => a.tool === "send_email" && a.status === "executed");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/overview" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to console
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-2xs text-ink-faint">
          <span className="chip text-2xs">
            <MessageSquareCode className="h-3 w-3" /> Secure Document Assistant
          </span>
          <span className="chip text-2xs">demo only</span>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">PromptWall Secure Document Assistant</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            The same document, the same request, two different execution paths. Switch modes to show what
            inspection and a tool gate change — and what they still do not guarantee.
          </p>
        </div>
        <div
          className="flex items-center rounded-md border border-line bg-surface p-0.5"
          role="group"
          aria-label="Protection mode"
        >
          <button
            type="button"
            onClick={() => switchMode("unprotected")}
            aria-pressed={mode === "unprotected"}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "unprotected" ? "bg-danger/15 text-danger" : "text-ink-muted hover:text-ink-secondary",
            )}
          >
            <ShieldOff className="h-3.5 w-3.5" /> Unprotected
          </button>
          <button
            type="button"
            onClick={() => switchMode("protected")}
            aria-pressed={mode === "protected"}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "protected" ? "bg-success/15 text-success" : "text-ink-muted hover:text-ink-secondary",
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Protected
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-md border border-info/20 bg-info/[0.05] px-3.5 py-2.5 text-xs leading-relaxed text-info/90">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This demo runs entirely in the browser. The protected path uses a small local pattern scan to
          illustrate the product; it is not the real detector, and no backend enforces the approvals shown.
          Events created here are labelled fixture data in the console.
        </span>
      </div>

      <div
        className={cn(
          "mb-4 flex items-center gap-2 rounded-md border px-3.5 py-2 text-xs",
          mode === "protected"
            ? "border-success/25 bg-success/[0.06] text-success"
            : "border-danger/25 bg-danger/[0.06] text-danger",
        )}
        role="status"
      >
        {mode === "protected" ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
        <span>
          {mode === "protected"
            ? "Protected: requests are inspected, retrieved content is treated as untrusted, and sensitive tools are gated."
            : "Unprotected: the assistant follows the document directly. Actions execute without review."}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px,minmax(0,1fr),310px]">
        <div className="space-y-4">
          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Documents</h2>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="btn btn-sm btn-ghost"
                aria-label="Upload a text document"
              >
                <Upload className="h-3.5 w-3.5" /> Upload
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.md,.markdown,.csv,.log,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                  e.target.value = "";
                }}
              />
            </div>
            <ul className="divide-y divide-line/60">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5",
                      doc.id === selectedId ? "bg-accent/[0.06]" : "hover:bg-raised/40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(doc.id);
                        setMessages([]);
                        setLatest(null);
                        setActions([]);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-pressed={doc.id === selectedId}
                    >
                      <FileText
                        className={cn("h-4 w-4 shrink-0", doc.id === selectedId ? "text-accent" : "text-ink-faint")}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-ink-secondary">{doc.name}</span>
                        <span className="block text-2xs text-ink-faint">{doc.size}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectDoc(doc)}
                      className="rounded p-1 text-ink-faint hover:bg-raised hover:text-ink"
                      aria-label={`Inspect ${doc.name}`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel p-4">
            <SectionTitle>Try this</SectionTitle>
            <ol className="space-y-2 text-2xs leading-relaxed text-ink-muted">
              <li className="flex gap-2">
                <span className="font-mono text-accent">1</span> In unprotected mode, ask to summarize
                <span className="font-mono text-ink-secondary"> Q3_board_notes.md</span>.
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-accent">2</span> Note the executed email and delete.
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-accent">3</span> Switch to protected and repeat.
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-accent">4</span> Open the event, then review the pending
                approval in the console.
              </li>
            </ol>
          </section>
        </div>

        <section className="panel flex min-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-raised">
                <MessageSquareCode className="h-3.5 w-3.5 text-accent" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Assistant</h2>
                <p className="text-2xs text-ink-faint">
                  {mode === "protected" ? "gateway in path" : "direct provider call"}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-2xs",
                mode === "protected"
                  ? "border-success/25 bg-success/[0.07] text-success"
                  : "border-danger/25 bg-danger/[0.07] text-danger",
              )}
            >
              {mode === "protected" ? "protected" : "unprotected"}
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <div className="max-w-[92%] rounded-md border border-line bg-overlay/50 px-3 py-2.5 text-xs leading-relaxed text-ink-secondary">
              {assistantIntro}
            </div>
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="ml-auto max-w-[88%] rounded-md border border-accent/20 bg-accent/[0.07] px-3 py-2 text-xs leading-relaxed text-ink">
                  {message.content}
                </div>
              ) : (
                <div key={message.id} className="max-w-[94%] rounded-md border border-line bg-raised/60 px-3 py-2.5">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">{message.content}</p>
                  {message.result ? <SecurityResult result={message.result} /> : null}
                  {message.actions && message.actions.length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {message.actions.map((action) => (
                        <ActionRow key={action.id} action={action} />
                      ))}
                    </div>
                  ) : null}
                  {mode === "protected" && message.actions?.some((a) => a.status === "awaiting_approval") ? (
                    <Link to="/approvals" className="mt-2 inline-flex items-center gap-1 text-2xs text-warning hover:underline">
                      Review in Tool Approvals <ArrowRight className="h-2.5 w-2.5" />
                    </Link>
                  ) : null}
                </div>
              ),
            )}
            {busy ? (
              <div className="flex items-center gap-2 text-2xs text-ink-muted">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                {mode === "protected" ? "Inspecting and forwarding…" : "Calling the provider directly…"}
              </div>
            ) : null}
          </div>

          <div className="border-t border-line px-4 py-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt.label}
                  type="button"
                  onClick={() => send(prompt.prompt, prompt.intent)}
                  disabled={busy}
                  className="rounded border border-line bg-raised px-2 py-1 text-2xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input, intentFor(input));
              }}
            >
              <div className="min-w-0 flex-1">
                <label htmlFor="demo-message" className="sr-only">
                  Message
                </label>
                <textarea
                  id="demo-message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input, intentFor(input));
                    }
                  }}
                  placeholder={`Ask about ${document.name}…`}
                  rows={1}
                  className="input min-h-[38px] resize-none py-2 text-xs"
                  maxLength={2000}
                />
              </div>
              <Button type="submit" variant="primary" disabled={busy || !input.trim()} aria-label="Send message">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
            <p className="mt-1.5 flex items-center gap-1 text-2xs text-ink-faint">
              <Paperclip className="h-2.5 w-2.5" /> Using {document.name}. Input is treated as untrusted text.
            </p>
          </div>
        </section>

        <div className="space-y-4">
          <section className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Security status</h2>
              {latest ? <DecisionBadge decision={latest.decision} /> : null}
            </div>
            <div className="space-y-3 px-4 py-3">
              {mode === "unprotected" ? (
                <>
                  <div className="flex items-start gap-2 rounded border border-danger/25 bg-danger/[0.06] px-2.5 py-2 text-2xs leading-relaxed text-danger/90">
                    <ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    No inspection. No policy. No audit trail. The assistant follows the document and tools
                    run immediately.
                  </div>
                  {dangerousActions.length > 0 ? (
                    <div>
                      <SectionTitle>Dangerous actions executed</SectionTitle>
                      <div className="space-y-1.5">
                        {dangerousActions.map((action) => (
                          <ActionRow key={action.id} action={action} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-2xs text-ink-faint">Send a request to see what executes unchecked.</p>
                  )}
                  {unsafeEmails.length > 0 ? (
                    <div className="rounded border border-danger/20 bg-danger/[0.04] px-2.5 py-2 text-2xs text-danger/90">
                      <Mail className="mb-1 h-3 w-3" />
                      Outbox: {unsafeEmails.map((a) => String(a.args.to)).join(", ")}. Data has left the
                      application.
                    </div>
                  ) : null}
                </>
              ) : latest ? (
                <>
                  <div className="flex items-end justify-between">
                    <span className="font-mono text-2xl font-semibold text-ink">
                      {latest.event.final_score.toFixed(2)}
                    </span>
                    <span className="text-2xs text-ink-faint">final risk</span>
                  </div>
                  <RiskBar score={latest.event.final_score} decision={latest.decision} />
                  <div className="space-y-1.5">
                    {latest.event.detections.length === 0 ? (
                      <p className="text-2xs text-ink-muted">No detections for this request.</p>
                    ) : (
                      latest.event.detections.map((detection) => (
                        <div key={detection.id} className="rounded border border-line bg-overlay/40 px-2 py-1.5">
                          <p className="text-2xs text-ink-secondary">{CATEGORY_META[detection.category].label}</p>
                          <p className="font-mono text-2xs text-ink-faint">
                            {detection.layer} · score {detection.score.toFixed(2)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  <Link
                    to={`/events/${latest.event.id}`}
                    className="flex items-center justify-between rounded border border-line bg-raised px-2.5 py-2 text-2xs text-ink-muted hover:text-ink"
                  >
                    Event {truncateMiddle(latest.event.id, 10, 4)}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                  <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-faint">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success/70" />
                    Detection and audit are modelled; tool enforcement is simulated in this page.
                  </p>
                </>
              ) : (
                <p className="text-2xs leading-relaxed text-ink-faint">
                  Waiting for the first protected request. The decision, score and detections will appear
                  here before the assistant answers.
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Tool activity</h2>
              <span className="chip text-2xs">
                <Lock className="h-3 w-3" /> gated
              </span>
            </div>
            <div className="space-y-1.5 px-4 py-3">
              {actions.length === 0 ? (
                <p className="text-2xs text-ink-faint">No tool calls yet.</p>
              ) : (
                actions.map((action) => <ActionRow key={action.id} action={action} />)
              )}
            </div>
            <div className="border-t border-line px-4 py-2.5">
              <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-faint">
                <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                The frontend cannot execute tools. A backend gate must verify the approval hash before any
                real action runs.
              </p>
            </div>
          </section>

          <section className="panel p-4">
            <SectionTitle>Try the clean document</SectionTitle>
            <p className="text-2xs leading-relaxed text-ink-muted">
              Select <span className="font-mono text-ink-secondary">refund_policy.md</span>. In protected
              mode the request is allowed and no spans are removed; email still waits for approval because
              the tool policy requires it. In unprotected mode it sends immediately.
            </p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-2xs text-accent/90 hover:text-accent"
              onClick={() => {
                const doc = documents.find((d) => d.id === "doc_refund");
                if (doc) {
                  setSelectedId(doc.id);
                  setMessages([]);
                  setLatest(null);
                  setActions([]);
                }
              }}
            >
              Select refund_policy.md <ArrowRight className="h-2.5 w-2.5" />
            </button>
          </section>

          <UnsupportedNote>
            No enforcement is claimed here. The approval and denial text describes intended behavior; the
            backend tool gate does not exist yet.
          </UnsupportedNote>
        </div>
      </div>

      <Drawer
        open={inspectDoc !== null}
        onClose={() => setInspectDoc(null)}
        title={inspectDoc ? `Document · ${inspectDoc.name}` : "Document"}
        width="md"
      >
        {inspectDoc ? (
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-2">
              <span className="chip text-2xs">
                <Trash2 className="h-3 w-3" /> {inspectDoc.size}
              </span>
              <span className="text-2xs text-ink-faint">
                Displayed as inert text. Nothing here is rendered as HTML.
              </span>
            </div>
            <CodeBlock code={inspectDoc.content} language="text" maxHeight="480px" />
            <p className="text-2xs leading-relaxed text-ink-faint">
              The demo scans this text when a protected request is sent. Detection is a local regex
              approximation, not the gateway detector.
            </p>
            <Button onClick={() => setInspectDoc(null)}>
              <X className="h-3.5 w-3.5" /> Close
            </Button>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
