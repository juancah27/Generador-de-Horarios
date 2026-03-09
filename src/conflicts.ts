import { DAY_NAME, P_TYPES, T_TYPES } from "./constants";
import type { ClassEntry, ClashResult, DayCode, ScheduleParams, SectionData } from "./types";

const isT = (t: string): boolean => T_TYPES.includes((t || "").trim().toUpperCase());
const isP = (t: string): boolean => P_TYPES.includes((t || "").trim().toUpperCase());

export function overlapH(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

export function classifyClash(c1: ClassEntry, c2: ClassEntry, params: ScheduleParams): ClashResult | null {
  if (String(c1.dia).trim() !== String(c2.dia).trim()) return null;
  const ov = overlapH(c1.inicio, c1.fin, c2.inicio, c2.fin);
  if (ov <= 0) return null;

  let kind: ClashResult["kind"];
  let maxOk: number;

  if (isT(c1.tipo) && isT(c2.tipo)) {
    kind = "TT";
    maxOk = params.ruleTT;
  } else if (isP(c1.tipo) && isP(c2.tipo)) {
    kind = "PP";
    maxOk = 0;
  } else {
    kind = "TP";
    maxOk = params.ruleTP;
  }

  const violated = kind === "PP" ? ov > 0 : params.allowPartial ? ov > maxOk : ov > 0;
  return { ov, kind, maxOk, violated, c1, c2 };
}

export function clashReport(clases1: ClassEntry[], clases2: ClassEntry[], params: ScheduleParams): ClashResult[] {
  const out: ClashResult[] = [];
  for (const a of clases1) {
    for (const b of clases2) {
      const r = classifyClash(a, b, params);
      if (r) out.push(r);
    }
  }
  return out;
}

export function hardViolationsForSection(sec: SectionData, params: ScheduleParams): string[] {
  const issues: string[] = [];
  for (const c of sec.clases) {
    const d = String(c.dia).trim() as DayCode;
    if (c.inicio < params.minHour) issues.push(`Inicia ${c.inicio}h < min ${params.minHour}h`);
    if (c.fin > params.maxHour) issues.push(`Termina ${c.fin}h > max ${params.maxHour}h`);
    if (params.freeDays.includes(d)) issues.push(`Cae en ${DAY_NAME[d]} (dia libre)`);
  }
  return [...new Set(issues)];
}

export function causesViolation(
  courseName: string,
  secData: SectionData,
  testSet: Record<string, SectionData>,
  params: ScheduleParams,
): boolean {
  if (hardViolationsForSection(secData, params).length > 0) return true;

  for (const [existingCourse, existingSec] of Object.entries(testSet)) {
    if (existingCourse === courseName) continue;
    const reports = clashReport(secData.clases, existingSec.clases, params);
    if (reports.some((r) => r.violated)) return true;
  }
  return false;
}

export function getViolators(sel: Record<string, SectionData>, params: ScheduleParams): Set<string> {
  const bad = new Set<string>();
  const list = Object.entries(sel);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const c1 = list[i];
      const c2 = list[j];
      if (clashReport(c1[1].clases, c2[1].clases, params).some((r) => r.violated)) {
        bad.add(c1[0]);
        bad.add(c2[0]);
      }
    }
    if (hardViolationsForSection(list[i][1], params).length) bad.add(list[i][0]);
  }
  return bad;
}
