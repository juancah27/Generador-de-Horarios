import * as XLSX from "xlsx";
import { EXCEL_COURSES_FILE, EXCEL_TEACHERS_FILE } from "./constants";
import { normalizeCourseName, normalizeDay, normalizeTeacherName, parseHour } from "./utils";
import type { CoursesData, TeacherScores } from "./types";

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
  let headerIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const c1 = normalizeCourseName(String(row[0] ?? ""));
    const c2 = normalizeCourseName(String(row[1] ?? ""));
    const c3 = normalizeCourseName(String(row[2] ?? ""));
    if (c1 === "CODIGO" && c2.includes("NOMBRE DEL CURSO") && c3 === "SECCION") {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) return out;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const codigo = String(row[0] ?? "").trim();
    const curso = String(row[1] ?? "").trim();
    const secId = String(row[2] ?? "").trim();
    const docente = String(row[4] ?? "").trim();
    const tipo = normalizeType(row[5]);
    const dia = normalizeDay(String(row[6] ?? ""));
    const inicio = parseHour(row[7]);
    const fin = parseHour(row[8]);

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
