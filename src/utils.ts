import type { DayCode } from "./types";

const DAY_ALIAS: Record<string, DayCode> = {
  LU: "LU",
  LUN: "LU",
  LUNES: "LU",
  MA: "MA",
  MAR: "MA",
  MARTES: "MA",
  MI: "MI",
  MIE: "MI",
  MIERCOLES: "MI",
  JU: "JU",
  JUE: "JU",
  JUEVES: "JU",
  VI: "VI",
  VIE: "VI",
  VIERNES: "VI",
  SA: "SA",
  SAB: "SA",
  SABADO: "SA",
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeTeacherName(value: string): string {
  return normalizeText(String(value || "").replace(/-/g, " ").replace(/,/g, " "));
}

export function normalizeCourseName(value: string): string {
  return normalizeText(String(value || ""));
}

export function normalizeDay(value: string): DayCode | "" {
  const key = normalizeText(String(value || ""));
  return DAY_ALIAS[key] || "";
}

export function parseHour(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw <= 1 ? Math.round(raw * 24) : Math.round(raw);
  const txt = String(raw).trim();
  if (!txt) return null;
  if (/^\d{1,2}:\d{2}/.test(txt)) return parseInt(txt.split(":")[0], 10);
  const n = Number(txt.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 24) : Math.round(n);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
