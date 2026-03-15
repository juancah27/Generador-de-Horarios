import * as XLSX from "xlsx";
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

export async function loadDefaultData(): Promise<{ courses: CoursesData; scores: TeacherScores }> {
  const [courses, scores] = await Promise.all([
    fetchJson<CoursesData>("/data/courses.default.json"),
    fetchJson<TeacherScores>("/data/teacher-scores.default.json"),
  ]);
  return { courses, scores };
}

export async function loadCoursesFromExcel(): Promise<CoursesData | null> {
  try {
    const rows = await readFirstSheetRows(EXCEL_COURSES_FILE);
    const parsed = buildCoursesFromRows(rows);
    return Object.keys(parsed).length ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadTeacherScoresFromExcel(): Promise<TeacherScores | null> {
  try {
    const rows = await readFirstSheetRows(EXCEL_TEACHERS_FILE);
    const parsed: TeacherScores = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const docente = normalizeTeacherName(String(row[0] ?? ""));
      const nota = Number(row[1]);
      if (!docente || !Number.isFinite(nota)) continue;
      parsed[docente] = nota;
    }
    return Object.keys(parsed).length ? parsed : null;
  } catch {
    return null;
  }
}

async function readFirstSheetRows(fileName: string): Promise<unknown[][]> {
  const res = await fetch(encodeURI(fileName), { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer ${fileName}`);
  const buffer = await res.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  if (!wb.SheetNames.length) throw new Error(`Sin hojas en ${fileName}`);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
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

function buildCoursesFromRows(rows: unknown[][]): CoursesData {
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
