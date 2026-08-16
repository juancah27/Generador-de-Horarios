import { COLORS, DAY_NAME } from "./constants";
import { clashReport, hardViolationsForSection } from "./conflicts";
import { normalizeTeacherName } from "./utils";
import type { CoursesData, DayCode, OptimizerReport, ScheduleParams, SectionData, TeacherScores } from "./types";

/** Tope de nodos explorados por la busqueda. Evita colgar la UI con datasets grandes. */
const SEARCH_BUDGET = 200_000;

/** Tope de firmas de docentes distintas retenidas durante la busqueda. */
const MAX_VARIANT_KEYS = 400;

interface Candidate {
  course: string;
  sid: string;
  sec: SectionData;
  score: number;
  hardIssues: string[];
  /** Indice global dentro de `allCandidates`, usado por la matriz de compatibilidad. */
  idx: number;
  /** Docente normalizado. Precalculado: se usa en cada hoja del backtracking. */
  teacherKey: string;
}

interface CourseSlot {
  course: string;
  /** Candidatos sin violaciones duras, de mejor a peor score. */
  feasible: Candidate[];
  /** Todos los candidatos evaluados, para el reporte de descarte. */
  all: Candidate[];
  /** Curso anclado por el usuario: la busqueda no puede saltearlo. */
  required: boolean;
}

export interface VariantOptions {
  /** Cuantas alternativas devolver como maximo. */
  count: number;
  /** Curso -> secId anclado por el usuario. Se respeta en todas las alternativas. */
  pinned?: Record<string, string>;
}

export function runOptimizer(
  targets: string[],
  coursesData: CoursesData,
  teacherScores: TeacherScores,
  params: ScheduleParams,
): OptimizerReport {
  return runOptimizerVariants(targets, coursesData, teacherScores, params, { count: 1 })[0];
}

/**
 * Igual que `runOptimizer` pero devuelve varias combinaciones, cada una con un
 * conjunto de docentes distinto, de mejor a peor. La primera es exactamente la
 * que devolvia la busqueda de un solo resultado.
 *
 * Siempre devuelve al menos un reporte (vacio si no hay nada que colocar).
 */
export function runOptimizerVariants(
  targets: string[],
  coursesData: CoursesData,
  teacherScores: TeacherScores,
  params: ScheduleParams,
  opts: VariantOptions,
): OptimizerReport[] {
  const pinned = opts.pinned ?? {};
  const allCandidates: Candidate[] = [];
  const slots: CourseSlot[] = [];

  /**
   * Color por orden de `targets`, no por orden de la solucion ganadora: el
   * mismo curso conserva su color en todas las alternativas, que es lo que
   * hace comparables las mini grillas.
   */
  const colorMap: Record<string, string> = {};
  let colorIdx = 0;

  for (const course of targets) {
    const sections = coursesData[course];
    if (!sections) continue;

    colorMap[course] = COLORS[colorIdx % COLORS.length];
    colorIdx++;

    const all = Object.entries(sections).map(([sid, sd]) => {
      const sec: SectionData = { ...sd, secId: sid };
      const candidate: Candidate = {
        course,
        sid,
        sec,
        score: scoreSection(sec, teacherScores, params),
        hardIssues: hardViolationsForSection(sec, params),
        idx: allCandidates.length,
        teacherKey: normalizeTeacherName(sd.docente),
      };
      allCandidates.push(candidate);
      return candidate;
    });

    // Un curso anclado deja de tener alternativas: solo su seccion, aunque rompa
    // una restriccion dura. El usuario la fijo a proposito.
    const anchor = pinned[course] ? all.find((c) => c.sid === pinned[course]) : undefined;

    const feasible = anchor
      ? [anchor]
      : all
          .filter((c) => c.hardIssues.length === 0)
          .sort((a, b) => {
            const aNN = a.sec.docente.includes("NN");
            const bNN = b.sec.docente.includes("NN");
            if (aNN !== bNN) return Number(aNN) - Number(bNN);
            return b.score - a.score;
          });

    slots.push({ course, feasible, all, required: Boolean(anchor) });
  }

  const emptyReport = (): OptimizerReport => ({
    placed: {},
    dropped: [],
    hardMisses: [],
    colorMap: { ...colorMap },
    colorIdx,
  });

  if (!slots.length) return [emptyReport()];

  const compatible = buildCompatibilityMatrix(allCandidates, params);
  const variants = searchVariants(slots, compatible, params, Math.max(1, opts.count));

  return variants.map((picks) => {
    const report = emptyReport();
    for (const candidate of picks) report.placed[candidate.course] = candidate.sec;
    fillReportGaps(report, slots, picks, params);
    return report;
  });
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
 * Que docente dicta cada curso. Dos horarios con la misma firma son la misma
 * respuesta a "que otras posibilidades hay", aunque cambien de seccion o de
 * hora: se guarda solo el mejor de cada firma.
 */
function teacherKey(choice: Candidate[]): string {
  return choice
    .map((c) => `${c.course}::${c.teacherKey}`)
    .sort()
    .join("|");
}

/**
 * Backtracking sobre los cursos objetivo. Maximiza cursos colocados y, a
 * igual cantidad, la suma de scores. Los cursos mas restringidos van primero
 * para que la poda corte antes.
 *
 * A diferencia de la version de un solo incumbente, retiene una solucion por
 * firma de docentes y devuelve hasta `want` alternativas. Como el mapa se
 * vacia cada vez que sube `bestCount`, todo lo guardado tiene la misma
 * cantidad de cursos y alcanza con ordenar por score.
 *
 * La primera del ranking es exactamente la que devolvia la busqueda anterior:
 * mismo criterio y mismo desempate (`Array#sort` es estable, asi que a igual
 * score gana la hallada antes en el DFS).
 */
function searchVariants(
  slots: CourseSlot[],
  compatible: boolean[][],
  params: ScheduleParams,
  want: number,
): Candidate[][] {
  const ordered = [...slots].sort((a, b) => a.feasible.length - b.feasible.length);
  const limit = Math.max(1, params.maxCourses);

  const found = new Map<string, { picks: Candidate[]; score: number }>();
  let bestCount = 0;
  let budget = SEARCH_BUDGET;

  const current: Candidate[] = [];

  const record = (score: number): void => {
    // Una alternativa con menos cursos no le sirve a nadie: al subir el maximo
    // se tira lo guardado y el mapa queda solo con soluciones del mejor tamaño.
    if (current.length > bestCount) {
      bestCount = current.length;
      found.clear();
    }
    if (!current.length || current.length < bestCount) return;

    const key = teacherKey(current);
    const prev = found.get(key);
    if (prev) {
      if (score > prev.score) found.set(key, { picks: [...current], score });
      return;
    }
    // ponytail: tope duro sin desalojo. Al llenarse deja de admitir firmas
    // nuevas; las primeras son las de mejor score porque `feasible` viene
    // ordenado. Subirlo solo si un dataset real se queda corto de alternativas.
    if (found.size >= MAX_VARIANT_KEYS) return;
    found.set(key, { picks: [...current], score });
  };

  const dfs = (index: number, score: number): void => {
    if (budget-- <= 0) return;

    const remaining = ordered.length - index;
    const reachable = Math.min(current.length + remaining, limit);
    if (reachable < bestCount) return;

    if (index === ordered.length || current.length === limit) {
      record(score);
      return;
    }

    for (const candidate of ordered[index].feasible) {
      if (current.some((c) => !compatible[c.idx][candidate.idx])) continue;
      current.push(candidate);
      dfs(index + 1, score + candidate.score);
      current.pop();
    }

    // Saltear el curso: puede habilitar una combinacion mayor mas adelante.
    // Un curso anclado no se saltea nunca.
    if (!ordered[index].required) dfs(index + 1, score);
  };

  dfs(0, 0);

  if (!found.size) return [[]];

  const ranked = [...found.values()].sort((a, b) => b.score - a.score).map((e) => e.picks);
  return pickDiverse(ranked, want);
}

/**
 * Las mejores por score suelen diferir en un solo docente y las tarjetas se
 * verian casi iguales. Primera pasada: exigir dos docentes distintos contra
 * cada alternativa ya elegida. Segunda: rellenar con lo que quede (la firma ya
 * garantiza al menos una diferencia).
 */
function pickDiverse(ranked: Candidate[][], want: number): Candidate[][] {
  const out: Candidate[][] = [];
  for (const minDiff of [2, 1]) {
    for (const choice of ranked) {
      if (out.length >= want) return out;
      if (out.includes(choice)) continue;
      if (out.every((prev) => teacherDiff(prev, choice) >= minDiff)) out.push(choice);
    }
  }
  return out;
}

/** Cuantos cursos cambian de docente entre dos alternativas. */
function teacherDiff(a: Candidate[], b: Candidate[]): number {
  const byCourse = new Map(a.map((c) => [c.course, c.teacherKey]));
  return b.filter((c) => byCourse.get(c.course) !== c.teacherKey).length;
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
