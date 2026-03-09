import { DAYS, DEFAULT_PARAMS } from "./constants";
import { clamp } from "./utils";
import type { DayCode, ScheduleParams } from "./types";

export function normalizeParams(raw: Partial<ScheduleParams>): ScheduleParams {
  const minHour = clamp(toFinite(raw.minHour, DEFAULT_PARAMS.minHour), 7, 22);
  const maxHour = clamp(toFinite(raw.maxHour, DEFAULT_PARAMS.maxHour), minHour, 22);
  const freeDays = dedupeDays(raw.freeDays ?? DEFAULT_PARAMS.freeDays);

  const params: ScheduleParams = {
    ruleTT: clamp(toFinite(raw.ruleTT, DEFAULT_PARAMS.ruleTT), 0, 8),
    ruleTP: clamp(toFinite(raw.ruleTP, DEFAULT_PARAMS.ruleTP), 0, 8),
    minHour,
    maxHour,
    freeDays,
    priority: (raw.priority ?? DEFAULT_PARAMS.priority) as ScheduleParams["priority"],
    maxCourses: clamp(toFinite(raw.maxCourses, DEFAULT_PARAMS.maxCourses), 1, 12),
    allowPartial: toBoolean(raw.allowPartial, DEFAULT_PARAMS.allowPartial),
  };

  if (!["balanced", "teacher", "freedays", "compact", "late"].includes(params.priority)) {
    params.priority = DEFAULT_PARAMS.priority;
  }

  return params;
}

export function readParamsFromModal(): Partial<ScheduleParams> {
  const fd: DayCode[] = [];
  document.querySelectorAll<HTMLInputElement>(".day-check input:checked").forEach((cb) => {
    fd.push(cb.value as DayCode);
  });

  return {
    ruleTT: parseInt((document.getElementById("rule-tt") as HTMLInputElement).value, 10),
    ruleTP: parseInt((document.getElementById("rule-tp") as HTMLInputElement).value, 10),
    minHour: parseInt((document.getElementById("opt-min-hour") as HTMLSelectElement).value, 10),
    maxHour: parseInt((document.getElementById("opt-max-hour") as HTMLSelectElement).value, 10),
    priority: (document.getElementById("opt-priority") as HTMLSelectElement).value as ScheduleParams["priority"],
    maxCourses: parseInt((document.getElementById("opt-max-courses") as HTMLInputElement).value, 10),
    allowPartial: (document.getElementById("allow-partial-conflict") as HTMLInputElement).checked,
    freeDays: fd,
  };
}

export function fillModalFromParams(p: ScheduleParams): void {
  (document.getElementById("rule-tt") as HTMLInputElement).value = String(p.ruleTT);
  (document.getElementById("rule-tp") as HTMLInputElement).value = String(p.ruleTP);
  (document.getElementById("opt-min-hour") as HTMLSelectElement).value = String(p.minHour);
  (document.getElementById("opt-max-hour") as HTMLSelectElement).value = String(p.maxHour);
  (document.getElementById("opt-priority") as HTMLSelectElement).value = p.priority;
  (document.getElementById("allow-partial-conflict") as HTMLInputElement).checked = p.allowPartial;
  (document.getElementById("opt-max-courses") as HTMLInputElement).value = String(p.maxCourses);

  document.querySelectorAll<HTMLElement>(".day-check").forEach((lbl) => {
    const day = lbl.dataset.day as DayCode;
    const cb = lbl.querySelector<HTMLInputElement>("input");
    if (!cb) return;
    cb.checked = p.freeDays.includes(day);
    lbl.classList.toggle("checked", cb.checked);
  });
}

function dedupeDays(days: DayCode[]): DayCode[] {
  const out = new Set<DayCode>();
  for (const d of days) {
    const day = String(d).trim().toUpperCase() as DayCode;
    if (DAYS.includes(day)) out.add(day);
  }
  return [...out];
}

function toFinite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}
