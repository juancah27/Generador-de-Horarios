import { EXCEL_COURSES_FILE, EXCEL_TEACHERS_FILE } from "./constants";
import { normalizeCourseName, normalizeDay, normalizeTeacherName, parseHour } from "./utils";
import type { CoursesData, TeacherScores } from "./types";

interface CourseColumns {
  codigo: number;
  curso: number;
  secId: number;
  docente: number;
  tipo: number;
  dia: number;
  inicio: number;
  fin: number;
}

/**
 * Resultado de leer un Excel opcional.
 * `error` solo se llena cuando el archivo existe pero no se pudo usar; que
 * falte es un caso normal (se cae al JSON por defecto) y no se reporta.
 */
export interface ExcelLoad<T> {
  data: T | null;
  error?: string;
}

/** Marca un fallo de lectura distinguible de "el archivo no esta". */
class ExcelError extends Error {}

export async function loadDefaultData(): Promise<{ courses: CoursesData; scores: TeacherScores }> {
  const [courses, scores] = await Promise.all([
    fetchJson<CoursesData>("/data/courses.default.json"),
    fetchJson<TeacherScores>("/data/teacher-scores.default.json"),
  ]);
  return { courses, scores };
}

export async function loadCoursesFromExcel(): Promise<ExcelLoad<CoursesData>> {
  return readExcel(EXCEL_COURSES_FILE, (rows) => {
    const parsed = buildCoursesFromRows(rows);
    if (!Object.keys(parsed).length) {
      throw new ExcelError("no se reconocieron columnas de cursos (CODIGO / NOMBRE DEL CURSO / SECCION)");
    }
    return parsed;
  });
}

export async function loadTeacherScoresFromExcel(): Promise<ExcelLoad<TeacherScores>> {
  return readExcel(EXCEL_TEACHERS_FILE, (rows) => {
    const parsed: TeacherScores = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const docente = normalizeTeacherName(String(row[0] ?? ""));
      const nota = Number(row[1]);
      if (!docente || !Number.isFinite(nota)) continue;
      parsed[docente] = nota;
    }
    if (!Object.keys(parsed).length) throw new ExcelError("no se encontraron pares docente/nota");
    return parsed;
  });
}

/** Lee un Excel opcional y traduce cualquier fallo real a un mensaje mostrable. */
async function readExcel<T>(fileName: string, parse: (rows: unknown[][]) => T): Promise<ExcelLoad<T>> {
  let rows: unknown[][];
  try {
    const found = await readFirstSheetRows(fileName);
    if (!found) return { data: null };
    rows = found;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { data: null, error: `${baseName(fileName)}: ${detail}` };
  }

  try {
    return { data: parse(rows) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { data: null, error: `${baseName(fileName)}: ${detail}` };
  }
}

/** Devuelve null si el archivo no existe; lanza si existe pero no se puede leer. */
async function readFirstSheetRows(fileName: string): Promise<unknown[][] | null> {
  const res = await fetch(encodeURI(fileName), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new ExcelError(`respuesta ${res.status} del servidor`);

  // El dev server de Vite responde 200 con index.html para archivos que no
  // existen. Sin este chequeo, un Excel ausente parecia un Excel corrupto.
  if ((res.headers.get("content-type") ?? "").includes("text/html")) return null;

  const buffer = await res.arrayBuffer();
  // xlsx pesa ~350 kB: se carga solo si de verdad hay un Excel que leer.
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  if (!wb.SheetNames.length) throw new ExcelError("el archivo no tiene hojas");

  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer ${url}`);
  return (await res.json()) as T;
}

function normalizeType(raw: unknown): string {
  const t = String(raw ?? "").trim().toUpperCase();
  if (t === "TEORIA") return "T";
  if (t === "PRACTICA") return "P";
  return t;
}

/** Exportada para tests: convierte las filas crudas del Excel en el modelo de cursos. */
export function buildCoursesFromRows(rows: unknown[][]): CoursesData {
  const out: CoursesData = {};
  const keyToName: Record<string, string> = {};

  const detected = detectHeaderAndColumns(rows);
  if (!detected) return out;

  for (let i = detected.headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codigo = String(row[detected.cols.codigo] ?? "").trim();
    const curso = String(row[detected.cols.curso] ?? "").trim();
    const secId = String(row[detected.cols.secId] ?? "").trim();
    const docente = String(row[detected.cols.docente] ?? "").trim();
    const tipo = normalizeType(row[detected.cols.tipo]);
    const dia = normalizeDay(String(row[detected.cols.dia] ?? ""));
    const inicio = parseHour(row[detected.cols.inicio]);
    const fin = parseHour(row[detected.cols.fin]);

    if (!codigo || !curso || !secId || !dia || inicio === null || fin === null || fin <= inicio) continue;

    const canonicalKey = `${codigo}|${normalizeCourseName(curso)}`;
    if (!keyToName[canonicalKey]) keyToName[canonicalKey] = curso.toUpperCase();
    const cname = keyToName[canonicalKey];

    if (!out[cname]) out[cname] = {};
    if (!out[cname][secId]) out[cname][secId] = { docente: docente || "NN NN, NN NN", codigo, clases: [] };

    const exists = out[cname][secId].clases.some(
      (c) => c.tipo === tipo && c.dia === dia && c.inicio === inicio && c.fin === fin,
    );
    if (!exists) out[cname][secId].clases.push({ tipo, dia, inicio, fin });
  }

  return out;
}

function detectHeaderAndColumns(rows: unknown[][]): { headerIdx: number; cols: CourseColumns } | null {
  const byName = (
    normalized: string[],
    patterns: RegExp[],
    fallback: number,
  ): number => {
    for (const pattern of patterns) {
      const idx = normalized.findIndex((v) => pattern.test(v));
      if (idx >= 0) return idx;
    }
    return fallback;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const normalized = row.map((c) => normalizeCourseName(String(c ?? "")));

    const hasCode = normalized.includes("CODIGO");
    const hasCourse = normalized.some((v) => v.includes("NOMBRE DEL CURSO"));
    const hasSection = normalized.includes("SECCION");
    if (!hasCode || !hasCourse || !hasSection) continue;

    const cols: CourseColumns = {
      codigo: byName(normalized, [/^CODIGO$/], 0),
      curso: byName(normalized, [/NOMBRE DEL CURSO/], 1),
      secId: byName(normalized, [/^SECCION$/], 2),
      docente: byName(normalized, [/DOCENTE/], 4),
      tipo: byName(normalized, [/^TIPO/], 5),
      dia: byName(normalized, [/^DIA$/], 6),
      inicio: byName(normalized, [/HORA.*INICIO/, /^INICIO$/], 7),
      fin: byName(normalized, [/HORA.*FINAL/, /^FINAL$/], 8),
    };

    const validCols = Object.values(cols).every((n) => Number.isInteger(n) && n >= 0);
    if (validCols) return { headerIdx: i, cols };
  }

  return null;
}
