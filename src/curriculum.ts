import { normalizeText } from "./utils";
import type { Curriculum, CurriculumCourse, CourseKind, GradeRequirement } from "./types";

/** Tipos de curso que la malla distingue. Cualquier otro valor se ignora. */
const COURSE_KINDS: CourseKind[] = ["Obligatorio", "Electivo", "Complementario"];

/**
 * Arma la malla curricular desde las tres hojas del Excel.
 * Las columnas se ubican por nombre, no por posicion, para que agregar o mover
 * una columna en el Excel no rompa la carga.
 */
export function buildCurriculum(sheets: {
  cursos: unknown[][];
  prerequisitos: unknown[][];
  requisitos: unknown[][];
}): Curriculum {
  const byCode: Record<string, CurriculumCourse> = {};

  const cursos = headerMap(sheets.cursos, ["CODIGOCURSO", "NOMBRECURSO"]);
  if (cursos) {
    for (let i = cursos.idx + 1; i < sheets.cursos.length; i++) {
      const row = sheets.cursos[i] ?? [];
      const codigo = cell(row, cursos.cols.CODIGOCURSO).toUpperCase();
      if (!codigo) continue;

      const tipo = matchKind(cell(row, cursos.cols.TIPOCURSO));
      const ciclo = Number(cell(row, cursos.cols.CICLOPLAN));
      const creditos = Number(cell(row, cursos.cols.CREDITOS));

      byCode[codigo] = {
        codigo,
        nombre: cell(row, cursos.cols.NOMBRECURSO),
        creditos: Number.isFinite(creditos) ? creditos : 0,
        tipo,
        ciclo: Number.isInteger(ciclo) && ciclo > 0 ? ciclo : null,
        prereqs: [],
      };
    }
  }

  const prereqs = headerMap(sheets.prerequisitos, ["CODIGOCURSO", "CODIGOPREREQUISITO"]);
  if (prereqs) {
    for (let i = prereqs.idx + 1; i < sheets.prerequisitos.length; i++) {
      const row = sheets.prerequisitos[i] ?? [];
      const codigo = cell(row, prereqs.cols.CODIGOCURSO).toUpperCase();
      const prereqCode = cell(row, prereqs.cols.CODIGOPREREQUISITO).toUpperCase();
      if (!codigo || !prereqCode) continue;

      // Un curso puede tener varias filas de prerequisito.
      const target = byCode[codigo];
      if (!target || target.prereqs.some((p) => p.codigo === prereqCode)) continue;
      target.prereqs.push({
        codigo: prereqCode,
        nombre: cell(row, prereqs.cols.NOMBREPREREQUISITO) || byCode[prereqCode]?.nombre || prereqCode,
      });
    }
  }

  const requirements: GradeRequirement[] = [];
  const reqs = headerMap(sheets.requisitos, ["TIPOCURSO", "CREDITOSMINIMOS"]);
  if (reqs) {
    for (let i = reqs.idx + 1; i < sheets.requisitos.length; i++) {
      const row = sheets.requisitos[i] ?? [];
      const tipo = cell(row, reqs.cols.TIPOCURSO);
      const creditos = Number(cell(row, reqs.cols.CREDITOSMINIMOS));
      if (!tipo || !Number.isFinite(creditos)) continue;
      requirements.push({
        tipo,
        creditosMinimos: creditos,
        observacion: cell(row, reqs.cols.OBSERVACION),
      });
    }
  }

  const cycles = [...new Set(Object.values(byCode).map((c) => c.ciclo))]
    .filter((c): c is number => c !== null)
    .sort((a, b) => a - b);

  return { byCode, requirements, cycles };
}

/** Suma de creditos de los codigos dados, discriminada por tipo de curso. */
export function creditsByKind(
  curriculum: Curriculum,
  codes: string[],
): { total: number; byKind: Record<CourseKind, number>; sinMalla: number } {
  const byKind: Record<CourseKind, number> = { Obligatorio: 0, Electivo: 0, Complementario: 0 };
  let total = 0;
  let sinMalla = 0;

  for (const code of codes) {
    const course = curriculum.byCode[code.trim().toUpperCase()];
    if (!course) {
      sinMalla++;
      continue;
    }
    byKind[course.tipo] += course.creditos;
    total += course.creditos;
  }

  return { total, byKind, sinMalla };
}

/**
 * Ciclos del plan que tienen al menos un curso ofertado, ordenados.
 *
 * `Curriculum.cycles` trae los diez ciclos del plan, pero la oferta de un
 * periodo no los cubre todos. Filtrar el catalogo por un ciclo sin oferta lo
 * deja vacio, asi que quien ofrezca ciclos para elegir debe usar esta lista.
 */
export function offeredCycles(curriculum: Curriculum, codes: string[]): number[] {
  const found = new Set<number>();

  for (const code of codes) {
    const ciclo = curriculum.byCode[code.trim().toUpperCase()]?.ciclo;
    if (ciclo !== null && ciclo !== undefined) found.add(ciclo);
  }

  return [...found].sort((a, b) => a - b);
}

/** Etiqueta corta para las insignias del catalogo. */
export function kindLabel(tipo: CourseKind): string {
  if (tipo === "Obligatorio") return "OBL";
  if (tipo === "Electivo") return "ELE";
  return "COMP";
}

function matchKind(raw: string): CourseKind {
  const normalized = normalizeText(raw);
  return COURSE_KINDS.find((k) => normalizeText(k) === normalized) ?? "Obligatorio";
}

function cell(row: unknown[], index: number | undefined): string {
  if (index === undefined) return "";
  return String(row[index] ?? "").trim();
}

/**
 * Busca la fila de cabecera que contenga todas las columnas requeridas y
 * devuelve el indice de cada columna por su nombre normalizado.
 */
function headerMap(
  rows: unknown[][],
  required: string[],
): { idx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < rows.length; i++) {
    const names = (rows[i] ?? []).map((c) => normalizeText(String(c ?? "")).replace(/\s/g, ""));
    if (!required.every((r) => names.includes(r))) continue;

    const cols: Record<string, number> = {};
    names.forEach((name, index) => {
      if (name && cols[name] === undefined) cols[name] = index;
    });
    return { idx: i, cols };
  }
  return null;
}
