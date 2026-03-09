import { COLORS, DAY_NAME } from "./constants";
import { causesViolation, clashReport, hardViolationsForSection } from "./conflicts";
import { normalizeTeacherName } from "./utils";
import type { CoursesData, DayCode, OptimizerReport, ScheduleParams, SectionData, TeacherScores } from "./types";

export function runOptimizer(
  targets: string[],
  coursesData: CoursesData,
  teacherScores: TeacherScores,
  params: ScheduleParams,
): OptimizerReport {
  const report: OptimizerReport = {
    placed: {},
    dropped: [],
    hardMisses: [],
    colorMap: {},
    colorIdx: 0,
  };

  for (const courseName of targets) {
    if (!coursesData[courseName]) continue;
    const allSecs = Object.entries(coursesData[courseName]);

    const ranked = allSecs
      .map(([sid, sd]) => {
        const sec = { ...sd, secId: sid };
        const hardIssues = hardViolationsForSection(sec, params);
        return {
          sid,
          sec,
          hardOk: hardIssues.length === 0 && !causesViolation(courseName, sec, report.placed, params),
          hardIssues,
          score: scoreSection(sec, teacherScores, params),
          isNN: sec.docente.includes("NN"),
        };
      })
      .sort((a, b) => {
        if (a.hardOk !== b.hardOk) return Number(b.hardOk) - Number(a.hardOk);
        if (a.isNN !== b.isNN) return Number(a.isNN) - Number(b.isNN);
        return b.score - a.score;
      });

    const best = ranked.find((r) => r.hardOk);
    if (best) {
      report.placed[courseName] = best.sec;
      report.colorMap[courseName] = COLORS[report.colorIdx % COLORS.length];
      report.colorIdx++;
      continue;
    }

    const blockerSet = new Set<string>();
    for (const r of ranked.slice(0, 8)) {
      if (r.hardIssues.length) blockerSet.add(r.hardIssues.join(" · "));
      for (const [existingCourse, existingSec] of Object.entries(report.placed)) {
        for (const cr of clashReport(r.sec.clases, existingSec.clases, params)) {
          if (!cr.violated) continue;
          const d = DAY_NAME[String(cr.c1.dia).trim() as DayCode] ?? String(cr.c1.dia).trim();
          blockerSet.add(`\"${existingCourse.substring(0, 25)}\" (${cr.kind} ${cr.ov}h>${cr.maxOk}h en ${d})`);
        }
      }
    }

    if (ranked[0]?.hardIssues.length) {
      report.hardMisses.push({ course: courseName, issues: ranked[0].hardIssues });
    }

    report.dropped.push({
      course: courseName,
      reason: blockerSet.size ? `Bloqueado por: ${[...blockerSet].join("; ")}` : "Sin seccion compatible",
      checked: ranked.length,
    });
  }

  return report;
}

export function scoreSection(sd: SectionData, teacherScores: TeacherScores, params: ScheduleParams): number {
  let s = (lookupTeacherScore(sd.docente, teacherScores) ?? 12) * 3;
  const hardIssues = hardViolationsForSection(sd, params);
  const freeDayOk = !sd.clases.some((c) => params.freeDays.includes(String(c.dia).trim() as DayCode));
  const lateStart = sd.clases.every((c) => c.inicio >= params.minHour);

  if (freeDayOk) s += 30;
  if (lateStart) s += 20;
  if (params.priority === "teacher") s += (lookupTeacherScore(sd.docente, teacherScores) ?? 12) * 8;
  if (params.priority === "freedays") s += freeDayOk ? 60 : -30;
  if (params.priority === "late") s += lateStart ? 50 : -25;
  if (params.priority === "compact") {
    const hi = Math.max(...sd.clases.map((c) => c.fin));
    const lo = Math.min(...sd.clases.map((c) => c.inicio));
    s -= (hi - lo) * 2;
  }

  s -= hardIssues.length * 25;
  return s;
}

export function lookupTeacherScore(docente: string, teacherScores: TeacherScores): number | null {
  if (!docente || docente.includes("NN")) return null;
  const normalized = normalizeTeacherName(docente);

  if (teacherScores[normalized] !== undefined) return teacherScores[normalized];
  for (const [k, v] of Object.entries(teacherScores)) {
    const parts = k.split(" ");
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (first && last && normalized.includes(first) && normalized.includes(last)) return v;
  }
  return null;
}
