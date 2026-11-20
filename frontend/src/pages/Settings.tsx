import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  Database,
  Github,
  Info,
  Link2,
  Lock,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { API_BASE_URL, IS_LIVE } from "../lib/api";
import {
  CodeBlock,
  Field,
  PageHeader,
  Panel,
  PanelHeader,
  TextInput,
  Toggle,
  UnsupportedNote,
} from "../components/ui";
import { cn } from "../lib/utils";

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line/60 px-4 py-3.5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink">{title}</p>
        <p className="mt-0.5 max-w-xl text-2xs leading-relaxed text-ink-muted">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [approvalAlerts, setApprovalAlerts] = useState(true);
  const [digest, setDigest] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
  }, [reduceMotion]);

  return (
    <div>
      <PageHeader
        eyebrow={<><Monitor className="h-3 w-3" /> Console</>}
        title="Settings"
        description="Console preferences and connection details. Security policy itself lives under Policies and is scoped per project."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel>
            <PanelHeader
              title="Gateway connection"
              subtitle="Where this console reads security data from"
              actions={
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-2xs",
                    IS_LIVE
                      ? "border-success/25 bg-success/10 text-success"
                      : "border-warning/25 bg-warning/10 text-warning",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", IS_LIVE ? "bg-success" : "bg-warning")} />
                  {IS_LIVE ? "live" : "fixture"}
                </span>
              }
            />
            <div className="space-y-4 p-4">
              <Field
                label="API base URL"
                htmlFor="api-base"
                hint="Set at build time with VITE_API_BASE_URL. Changing it requires a redeploy, not a browser setting."
              >
                <TextInput
                  id="api-base"
                  value={API_BASE_URL || ""}
                  readOnly
                  placeholder="Not configured — fixture mode"
                  className="font-mono text-xs"
                />
              </Field>
              <CodeBlock
                code={`# .env.production (Vercel project settings)
VITE_API_BASE_URL=https://your-gateway.example.com

# The console then calls:
# GET {base}/admin/events
# GET {base}/healthz
# GET {base}/admin/projects
# ...see frontend/README.md for the full map`}
                language="bash"
                maxHeight="220px"
              />
              <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/[0.06] px-3 py-2.5 text-xs leading-relaxed text-warning/90">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Do not put ADMIN_TOKEN in VITE_* variables or localStorage. Vite inlines env values into
                  the bundle. Live integration needs a same-origin proxy or a server-side session that
                  holds the admin credential.
                </span>
              </div>
              {!IS_LIVE ? (
                <UnsupportedNote>
                  Fixture mode is active. All numbers, events, approvals and evaluation values are synthetic
                  and labelled as such. Nothing on screen represents real gateway activity.
                </UnsupportedNote>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Notifications" subtitle="Delivery preferences" />
            <SettingRow
              title="Security alerts"
              description="Repeated attacks, high-risk sessions and policy changes."
            >
              <Toggle checked={emailAlerts} onChange={setEmailAlerts} label="Security alert notifications" disabled />
            </SettingRow>
            <SettingRow
              title="Approval requests"
              description="Notify reviewers when a sensitive tool call is held."
            >
              <Toggle checked={approvalAlerts} onChange={setApprovalAlerts} label="Approval notifications" disabled />
            </SettingRow>
            <SettingRow title="Weekly digest" description="A summary of detections and decisions.">
              <Toggle checked={digest} onChange={setDigest} label="Weekly digest" disabled />
            </SettingRow>
            <div className="border-t border-line px-4 py-3">
              <UnsupportedNote>
                Notification preferences are not persisted. The backend has no preference endpoint and no
                delivery channel (email, Slack, webhook) yet, so these controls stay disabled rather than
                pretending to save.
              </UnsupportedNote>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Appearance" subtitle="Theme and motion" />
            <SettingRow title="Theme" description="The console is designed dark-first for operations rooms and low-light use.">
              <div className="flex items-center gap-1 rounded-md border border-line bg-overlay p-0.5">
                <span className="flex items-center gap-1 rounded bg-raised px-2 py-1 text-xs text-ink">
                  <Moon className="h-3 w-3" /> Dark
                </span>
                <span
                  className="flex cursor-not-allowed items-center gap-1 px-2 py-1 text-xs text-ink-faint"
                  title="Light theme is not implemented"
                >
                  <Palette className="h-3 w-3" /> Light
                </span>
              </div>
            </SettingRow>
            <SettingRow
              title="Reduce motion"
              description="Respect the OS 'prefers reduced motion' setting. The console also honours it automatically."
            >
              <Toggle checked={reduceMotion} onChange={setReduceMotion} label="Reduce motion" />
            </SettingRow>
          </Panel>

          <Panel>
            <PanelHeader title="Data and retention" subtitle="What the console can show" />
            <SettingRow
              title="Raw prompt retention"
              description="Controlled per project. When disabled, only hashes and masked evidence are stored and the reveal action disappears."
            >
              <span className="chip text-2xs">
                <Database className="h-3 w-3" /> per project
              </span>
            </SettingRow>
            <SettingRow
              title="Retention enforcement"
              description="The backend stores retention_days but a deletion job is not implemented in Week 1."
            >
              <span className="rounded border border-warning/25 bg-warning/[0.07] px-2 py-0.5 text-2xs text-warning">
                not enforced
              </span>
            </SettingRow>
            <SettingRow
              title="Audit export"
              description="Security events can be exported as CSV from the explorer. Audit records remain the source of truth in PostgreSQL."
            >
              <span className="chip text-2xs">CSV</span>
            </SettingRow>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="About" />
            <div className="space-y-3 px-4 py-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent/10">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                </span>
                <div>
                  <p className="font-semibold text-ink">PromptWall Console</p>
                  <p className="font-mono text-2xs text-ink-faint">0.1.0 · Week 1 UI</p>
                </div>
              </div>
              <p className="leading-relaxed text-ink-muted">
                Security operations interface for the PromptWall self-hosted gateway. Detection decisions
                and audit records come from the gateway; this console visualizes and operates them.
              </p>
              <div className="space-y-1.5 border-t border-line pt-3">
                <a
                  href="https://github.com/Alpha-coder25/promptWall"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded px-1 py-1 text-ink-secondary hover:bg-raised"
                >
                  <span className="flex items-center gap-2">
                    <Github className="h-3.5 w-3.5" /> Repository
                  </span>
                  <span className="text-2xs text-ink-faint">GitHub</span>
                </a>
                <a
                  href="https://github.com/Alpha-coder25/promptWall/blob/main/docs/limitations.md"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded px-1 py-1 text-ink-secondary hover:bg-raised"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" /> Known limitations
                  </span>
                  <span className="text-2xs text-ink-faint">docs</span>
                </a>
                <a
                  href="https://github.com/Alpha-coder25/promptWall/blob/main/README.md"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded px-1 py-1 text-ink-secondary hover:bg-raised"
                >
                  <span className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5" /> Gateway README
                  </span>
                  <span className="text-2xs text-ink-faint">docs</span>
                </a>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Access model" />
            <div className="space-y-3 px-4 py-3 text-2xs leading-relaxed text-ink-muted">
              <p className="flex items-start gap-1.5">
                <Lock className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" />
                The current backend authenticates administrators with a single shared ADMIN_TOKEN. There
                are no roles or per-user accounts, so this console does not pretend to offer RBAC.
              </p>
              <p className="flex items-start gap-1.5">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-success/70" />
                Project data is scoped by project_id in every query the UI makes.
              </p>
              <p className="flex items-start gap-1.5">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" />
                Anyone with the admin token can create projects, issue keys and rewrite policy. Protect it
                accordingly.
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Keyboard" />
            <div className="space-y-2 px-4 py-3 text-2xs text-ink-muted">
              {[
                ["Focus search", "/"],
                ["Close dialog / drawer", "Esc"],
                ["Submit search", "Enter"],
                ["New line in demo composer", "Shift + Enter"],
              ].map(([label, key]) => (
                <div key={label} className="flex items-center justify-between">
                  <span>{label}</span>
                  <kbd className="kbd">{key}</kbd>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="p-4">
              <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-faint">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                PromptWall reduces prompt-injection risk. It does not eliminate it. Detection is heuristic
                in Week 1 and thresholds are provisional.
              </p>
              <div className="mt-3 flex items-center gap-2 text-2xs text-ink-muted">
                <Check className="h-3 w-3 text-success" /> No fabricated metrics outside labelled fixture
                data
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
