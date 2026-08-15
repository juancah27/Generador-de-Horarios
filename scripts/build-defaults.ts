/**
 * Regenera los JSON de respaldo (`public/data/*.default.json`) desde los Excel.
 *
 * Los JSON son lo que la app pinta antes de que llegue el Excel, y lo unico
 * que le queda si el Excel no se puede leer. Cada vez que se cambian los
 * archivos de `public/data/`, corre `npm run build:data` para que el respaldo
 * deje de ser del ciclo anterior.
 *
 * Usa el mismo parser que la app (`buildCoursesFromRows`), asi que el JSON no
 * puede desviarse de lo que se veria en pantalla.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { buildCoursesFromRows } from "../src/data-service";
import { EXCEL_COURSES_FILE, EXCEL_TEACHERS_FILE } from "../src/constants";
import { normalizeTeacherName } from "../src/utils";
import type { TeacherScores } from "../src/types";

const DATA_DIR = "public";

function firstSheetRows(publicPath: string): unknown[][] {
  const wb = XLSX.read(readFileSync(`${DATA_DIR}${publicPath}`), { type: "buffer" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: "",
  }) as unknown[][];
}

function writeJson(name: string, value: unknown, summary: string): void {
  writeFileSync(`${DATA_DIR}/data/${name}`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`${name}: ${summary}`);
}

const courses = buildCoursesFromRows(firstSheetRows(EXCEL_COURSES_FILE));
if (!Object.keys(courses).length) throw new Error(`Sin cursos en ${EXCEL_COURSES_FILE}`);
const sections = Object.values(courses).reduce((n, secs) => n + Object.keys(secs).length, 0);
writeJson("courses.default.json", courses, `${Object.keys(courses).length} cursos, ${sections} secciones`);

const scoreRows = firstSheetRows(EXCEL_TEACHERS_FILE);
const scores: TeacherScores = {};
for (let i = 1; i < scoreRows.length; i++) {
  const row = scoreRows[i] ?? [];
  const docente = normalizeTeacherName(String(row[0] ?? ""));
  const nota = Number(row[1]);
  if (!docente || !Number.isFinite(nota)) continue;
  scores[docente] = nota;
}
if (!Object.keys(scores).length) throw new Error(`Sin notas en ${EXCEL_TEACHERS_FILE}`);
writeJson("teacher-scores.default.json", scores, `${Object.keys(scores).length} docentes`);
