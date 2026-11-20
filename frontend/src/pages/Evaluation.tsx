import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  BookOpen,
  FlaskConical,
  Info,
  Play,
  TriangleAlert,
} from "lucide-react";
import { api } from "../lib/api";
import {
  Button,
  ErrorState,
  InfoTip,
  PageHeader,
  Panel,
  PanelHeader,
  SelectInput,
  Skeleton,
  StatusBadge,
  UnsupportedNote,
  useToast,
} from "../components/ui";
import { CategoryRecallChart } from "../components/charts";
import { cn, formatDateTime, formatNumber } from "../lib/utils";
import { CATEGORY_META } from "../lib/mock";

function Metric({
  label,
  value,
  detail,
  definition,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  definition: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-1.5">
        <p className="text-2xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</p>
        <InfoTip>{definition}</InfoTip>
      </div>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-semibold tracking-tight",
          tone === "warn" ? "text-warning" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-2xs text-ink-faint">{detail}</p>
    </div>
  );
}

export default function EvaluationPage() {
  const runs = useQuery({ queryKey: ["evaluation-runs"], queryFn: api.listEvaluationRuns });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { toast } = useToast();

  const list = runs.data ?? [];
  const selected = list.find((r) => r.id === selectedId) ?? list[0];

  const exportReport = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Evaluation report exported", variant: "success" });
  };

  return (
    <div>
      <PageHeader
        eyebrow={<><FlaskConical className="h-3 w-3" /> Measurement</>}
        title="Evaluation & Benchmarks"
        description="PromptWall reports measured detection behavior instead of unsupported protection claims. A benchmark is evidence for one dataset and configuration — not a guarantee."
        actions={
          <>
            <Button onClick={exportReport} disabled={!selected}>
              <ArrowDownToLine className="h-3.5 w-3.5" /> Export run
            </Button>
            <Button variant="primary" disabled title="The evaluation harness is not deployed in this build">
              <Play className="h-3.5 w-3.5" /> Run benchmark
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/25 bg-warning/[0.06] px-3.5 py-2.5 text-xs leading-relaxed text-warning/90">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <strong className="font-semibold">Fixture run.</strong> The numbers on this page are illustrative
          UI data, not measured benchmark results. Do not cite them as detection performance. The Week 1
          backend has no evaluation endpoint; run results must come from a real harness.
        </span>
      </div>

      {runs.isError ? (
        <Panel>
          <ErrorState onRetry={() => runs.refetch()} />
        </Panel>
      ) : runs.isLoading || !selected ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 lg:col-span-2" />
            <Skeleton className="h-72" />
          </div>
        </div>
      ) : (
        <>
          <Panel className="mb-4">
            <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <SelectInput
                  value={selected.id}
                  onChange={(e) => setSelectedId(e.target.value)}
                  aria-label="Select evaluation run"
                  className="w-[260px] font-mono text-xs"
                >
                  {list.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.id} · {run.dataset_version}
                    </option>
                  ))}
                </SelectInput>
                <StatusBadge value={selected.status} />
                <span className="chip text-2xs">fixture</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-muted">
                <span>
                  Dataset <span className="text-ink-secondary">{selected.dataset}</span>
                </span>
                <span>
                  Cases <span className="font-mono text-ink-secondary">{formatNumber(selected.total_cases)}</span>
                </span>
                <span>
                  Run <span className="text-ink-secondary">{formatDateTime(selected.created_at)}</span>
                </span>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Metric
              label="Recall @ 1% FPR"
              value={`${(selected.recall_at_1pct_fpr * 100).toFixed(1)}%`}
              detail="Detection rate at a 1% false-positive budget"
              definition="Fraction of positive cases detected when the threshold is set so at most 1% of negatives are flagged."
            />
            <Metric
              label="FPR · hard negatives"
              value={`${(selected.fpr_hard_negatives * 100).toFixed(1)}%`}
              detail="Benign cases that look like attacks"
              definition="False positives on the hard-negative split: benign text deliberately close to injection patterns."
            />
            <Metric
              label="Latency p50 / p95"
              value={`${selected.latency_p50.toFixed(1)} / ${selected.latency_p95.toFixed(1)} ms`}
              detail="Gateway overhead, provider excluded"
              definition="Measured inspection time per case at the 50th and 95th percentile."
            />
            <Metric
              label="Judge usage"
              value={`${(selected.judge_rate * 100).toFixed(0)}%`}
              detail="Requests escalated to an LLM judge"
              definition="Share of cases that needed an LLM judge. Zero here because the judge is not implemented."
            />
            <Metric
              label="Adaptive ASR"
              value={selected.adaptive_asr === null ? "Not measured" : `${(selected.adaptive_asr * 100).toFixed(1)}%`}
              detail="Adaptive attack success rate"
              definition="Share of adaptive attacks that bypassed detection. Not measured in this build."
              tone="warn"
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <PanelHeader
                title="Per-category recall"
                subtitle="Fixture values; each category is measured on its own support set"
                actions={<span className="chip text-2xs">illustrative</span>}
              />
              <div className="px-3 pb-3 pt-2">
                <CategoryRecallChart data={selected.per_category} />
              </div>
              <div className="border-t border-line px-4 py-2.5 text-2xs text-ink-faint">
                Overall recall is not the average of per-category values: categories have different
                support sizes.
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Run configuration" subtitle="Snapshot used for this evaluation" />
              <div className="space-y-2.5 px-4 py-4 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Dataset</span>
                  <span className="text-right text-ink-secondary">{selected.dataset}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Version</span>
                  <span className="font-mono text-ink-secondary">{selected.dataset_version}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">License</span>
                  <span className="text-right text-ink-secondary">{selected.dataset_license}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Test cases</span>
                  <span className="font-mono text-ink-secondary">{formatNumber(selected.total_cases)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Config</span>
                  <span className="text-right font-mono text-2xs text-ink-secondary">
                    {selected.config_snapshot}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-ink-muted">Split</span>
                  <span className="text-right text-2xs text-ink-secondary">
                    test only · no tuning on this split
                  </span>
                </div>
              </div>
              <div className="border-t border-line px-4 py-3">
                <UnsupportedNote>
                  Dataset provenance, licensing and split metadata are placeholders in fixture mode. Do not
                  publish these numbers.
                </UnsupportedNote>
              </div>
            </Panel>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel className="xl:col-span-2">
              <PanelHeader title="Run history" subtitle="Compare changes across configurations" />
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Dataset</th>
                      <th>Recall @1% FPR</th>
                      <th>FPR</th>
                      <th>p95</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((run) => (
                      <tr
                        key={run.id}
                        className={cn("cursor-pointer", run.id === selected.id && "bg-raised/60")}
                        onClick={() => setSelectedId(run.id)}
                      >
                        <td className="font-mono text-xs text-accent/90">{run.id}</td>
                        <td className="text-xs text-ink-muted">{run.dataset_version}</td>
                        <td className="font-mono text-xs">{(run.recall_at_1pct_fpr * 100).toFixed(1)}%</td>
                        <td className="font-mono text-xs">{(run.fpr_hard_negatives * 100).toFixed(1)}%</td>
                        <td className="font-mono text-xs">{run.latency_p95.toFixed(1)} ms</td>
                        <td className="whitespace-nowrap text-xs text-ink-muted">
                          {formatDateTime(run.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="How to read this" />
              <div className="space-y-3 px-4 py-4">
                {[
                  {
                    term: "Recall @ 1% FPR",
                    text: "Higher is better at a fixed false-positive budget. It is not accuracy.",
                  },
                  {
                    term: "Hard negatives",
                    text: "Benign text that resembles attacks. This is where usability suffers first.",
                  },
                  {
                    term: "Adaptive ASR",
                    text: "How often an attacker who knows the detector succeeds. Requires a real adaptive harness.",
                  },
                ].map((item) => (
                  <div key={item.term}>
                    <p className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                      <BookOpen className="h-3 w-3 text-ink-faint" /> {item.term}
                    </p>
                    <p className="mt-0.5 text-2xs leading-relaxed text-ink-muted">{item.text}</p>
                  </div>
                ))}
                <p className="flex items-start gap-1.5 border-t border-line pt-2.5 text-2xs text-ink-faint">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  A benchmark result describes one dataset, one configuration and one point in time. It does
                  not prove protection against future attacks.
                </p>
              </div>
            </Panel>
          </div>

          <p className="mt-3 text-2xs text-ink-faint">
            Categories shown:{" "}
            {selected.per_category.map((c) => CATEGORY_META[c.category].label).join(", ")}.
          </p>
        </>
      )}
    </div>
  );
}
