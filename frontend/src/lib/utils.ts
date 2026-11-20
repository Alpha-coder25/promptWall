import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateOnly = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

export function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (diff < 45_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return formatDate(iso);
}

export const formatNumber = (value: number) => new Intl.NumberFormat().format(Math.round(value));

export const formatPercent = (value: number, digits = 0) =>
  `${(value * 100).toFixed(digits)}%`;

export const formatMs = (value: number) => `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`;

export function truncateMiddle(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function shortId(value: string): string {
  return value.length > 12 ? value.slice(0, 8) : value;
}

export function signedPercent(current: number, previous: number): string {
  if (previous === 0) return "new";
  const delta = ((current - previous) / previous) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`;
}

export const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
