import { COLORS, DAY_NAME } from "./constants";
import { clashReport, hardViolationsForSection } from "./conflicts";
import { normalizeTeacherName } from "./utils";
import type { CoursesData, DayCode, OptimizerReport, ScheduleParams, SectionData, TeacherScores } from "./types";

/** Tope de nodos explorados por la busqueda. Evita colgar la UI con datasets grandes. */
const SEARCH_BUDGET = 200_000;

interface Candidate {
  course: string;
  sid: string;
  sec: SectionData;
  score: number;
  hardIssues: string[];
  /** Indice global dentro de `allCandidates`, usado por la matriz de compatibilidad. */
  idx: number;
}

interface CourseSlot {
  course: string;
  /** Candidatos sin violaciones duras, de mejor a peor score. */
  feasible: Candidate[];
  /** Todos los candidatos evaluados, para el reporte de descarte. */
  all: Candidate[];
}

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

  const allCandidates: Candidate[] = [];
  const slots: CourseSlot[] = [];

  for (const course of targets) {
    const sections = coursesData[course];
    if (!sections) continue;

    const all = Object.entries(sections).map(([sid, sd]) => {
      const sec: SectionData = { ...sd, secId: sid };
      const candidate: Candidate = {
        course,
        sid,
        sec,
        score: scoreSection(sec, teacherScores, params),
        hardIssues: hardViolationsForSection(sec, params),
        idx: allCandidates.length,
      };
      allCandidates.push(candidate);
      return candidate;
    });

    const feasible = all
      .filter((c) => c.hardIssues.length === 0)
      .sort((a, b) => {
        const aNN = a.sec.docente.includes("NN");
        const bNN = b.sec.docente.includes("NN");
        if (aNN !== bNN) return Number(aNN) - Number(bNN);
        return b.score - a.score;
      });

    slots.push({ course, feasible, all });
  }

  if (!slots.length) return report;

  const compatible = buildCompatibilityMatrix(allCandidates, params);
  const best = search(slots, compatible, params);

  for (const candidate of best) {
    report.placed[candidate.course] = candidate.sec;
    report.colorMap[candidate.course] = COLORS[report.colorIdx % COLORS.length];
    report.colorIdx++;
  }

  fillReportGaps(report, slots, best, params);
  return report;
}

/**
 * Precomputa que pares de secciones (de cursos distintos) pueden coexistir.
 * Con <= 12 cursos objetivo esto son unos pocos miles de pares: barato, y
 * convierte cada chequeo del backtracking en un lookup O(1).
 */
function buildCompatibilityMatrix(candidates: Candidate[], params: ScheduleParams): boolean[][] {
  const n = candidates.length;
  const matrix: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(true));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (candidates[i].course === candidates[j].course) continue;
      const ok = !clashReport(candidates[i].sec.clases, candidates[j].sec.clases, params).some((r) => r.violated);
      matrix[i][j] = ok;
      matrix[j][i] = ok;
    }
  }

  return matrix;
}

/**
 * Backtracking sobre los cursos objetivo. Maximiza cursos colocados y, a
 * igual cantidad, la suma de scores. Los cursos mas restringidos van primero
 * para que la poda corte antes.
 */
function search(slots: CourseSlot[], compatible: boolean[][], params: ScheduleParams): Candidate[] {
  const ordered = [...slots].sort((a, b) => a.feasible.length - b.feasible.length);
  const limit = Math.max(1, params.maxCourses);

  let bestChoice: Candidate[] = [];
  let bestCount = 0;
  let bestScore = -Infinity;
  let budget = SEARCH_BUDGET;

  const current: Candidate[] = [];

  const dfs = (index: number, score: number): void => {
    if (budget-- <= 0) return;

    const remaining = ordered.length - index;
    const reachable = Math.min(current.length + remaining, limit);
    if (reachable < bestCount) return;

    if (index === ordered.length || current.length === limit) {
      if (current.length > bestCount || (current.length === bestCount && score > bestScore)) {
        bestCount = current.length;
        bestScore = score;
        bestChoice = [...current];
      }
      return;
    }

    for (const candidate of ordered[index].feasible) {
      if (current.some((c) => !compatible[c.idx][candidate.idx])) continue;
      current.push(candidate);
      dfs(index + 1, score + candidate.score);
      current.pop();
    }

    // Saltear el curso: puede habilitar una combinacion mayor mas adelante.
    dfs(index + 1, score);
  };

  dfs(0, 0);
  return bestChoice;
}

/** Arma `dropped` y `hardMisses` para los cursos que la busqueda no pudo colocar. */
function fillReportGaps(
  report: OptimizerReport,
  slots: CourseSlot[],
  placed: Candidate[],
  params: ScheduleParams,
): void {
  const placedByCourse = new Map(placed.map((c) => [c.course, c]));

  for (const slot of slots) {
    if (placedByCourse.has(slot.course)) continue;

    if (!slot.feasible.length && slot.all.length) {
      const issues = [...new Set(slot.all.flatMap((c) => c.hardIssues))];
      report.hardMisses.push({ course: slot.course, issues });
    }

    const blockers = new Set<string>();
    for (const candidate of slot.all.slice(0, 8)) {
      if (candidate.hardIssues.length) blockers.add(candidate.hardIssues.join(" · "));
      for (const other of placed) {
        for (const cr of clashReport(candidate.sec.clases, other.sec.clases, params)) {
          if (!cr.violated) continue;
          const d = DAY_NAME[String(cr.c1.dia).trim() as DayCode] ?? String(cr.c1.dia).trim();
          blockers.add(`"${other.course.substring(0, 25)}" (${cr.kind} ${cr.ov}h>${cr.maxOk}h en ${d})`);
        }
      }
    }

    report.dropped.push({
      course: slot.course,
      reason: blockers.size ? `Bloqueado por: ${[...blockers].join("; ")}` : "Sin seccion compatible",
      checked: slot.all.length,
    });
  }
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
  if (params.priority === "compact" && sd.clases.length) {
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
