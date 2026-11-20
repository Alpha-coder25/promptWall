import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Project } from "../types";

interface WorkspaceValue {
  projectId: string;
  setProjectId: (id: string) => void;
  project: Project | null;
  projects: Project[];
  projectsLoading: boolean;
  days: number;
  setDays: (days: number) => void;
  rangeLabel: string;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const STORAGE_PROJECT = "pw.project";
const STORAGE_DAYS = "pw.days";

function readProject(): string {
  try {
    return localStorage.getItem(STORAGE_PROJECT) ?? "all";
  } catch {
    return "all";
  }
}

function readDays(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_DAYS));
    return [7, 14, 30].includes(value) ? value : 7;
  } catch {
    return 7;
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState(readProject);
  const [days, setDaysState] = useState(readDays);
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });

  const projects = projectsQuery.data ?? [];
  const project = projects.find((p) => p.id === projectId) ?? null;

  const setProjectId = (id: string) => {
    setProjectIdState(id);
    try {
      localStorage.setItem(STORAGE_PROJECT, id);
    } catch {
      /* storage can be unavailable in private mode */
    }
  };

  const setDays = (value: number) => {
    setDaysState(value);
    try {
      localStorage.setItem(STORAGE_DAYS, String(value));
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<WorkspaceValue>(
    () => ({
      projectId,
      setProjectId,
      project,
      projects,
      projectsLoading: projectsQuery.isLoading,
      days,
      setDays,
      rangeLabel: `Last ${days} days`,
    }),
    [projectId, project, projects, projectsQuery.isLoading, days],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
