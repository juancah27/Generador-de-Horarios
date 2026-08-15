import type { DayCode, ScheduleParams } from "./types";

export const RECOMMENDED = [
  "AUTOMATIZACION Y CONTROL DE PROCESOS",
  "INGENIERIA DEL PRODUCTO",
  "TALLER DE PROYECTO DE INVESTIGACION",
  "INNOVACION Y EMPRENDIMIENTO DE NEGOCIOS",
  "PLANEAMIENTO Y CONTROL DE OPERACIONES",
  "SEGURIDAD Y SALUD OCUPACIONAL",
  "PLANEAMIENTO Y GESTION ESTRATEGICA",
];

export const DAYS: DayCode[] = ["LU", "MA", "MI", "JU", "VI", "SA"];
export const DAY_NAME: Record<DayCode, string> = {
  LU: "Lunes",
  MA: "Martes",
  MI: "Miercoles",
  JU: "Jueves",
  VI: "Viernes",
  SA: "Sabado",
};

/** Ventana horaria minima visible en la grilla; se expande segun params y cursos elegidos. */
export const BASE_HOUR_RANGE = { from: 8, to: 22 };
export const COLORS = Array.from({ length: 14 }, (_, i) => `color-${i}`);

/**
 * Punto de color de cada curso en el panel de resumen.
 * Espeja el `border-color` de las clases `.color-N` de styles.css: si cambia
 * una lista hay que cambiar la otra, y `tokens.test.ts` verifica que coincidan.
 */
export const DOT_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#eab308",
  "#14b8a6",
  "#a855f7",
  "#ef4444",
  "#6366f1",
  "#22c55e",
  "#fbbf24",
];

export const T_TYPES = ["T"];
export const P_TYPES = ["P", "PRA", "PC", "LAB"];

export const DEFAULT_PARAMS: ScheduleParams = {
  ruleTT: 4,
  ruleTP: 2,
  minHour: 16,
  maxHour: 22,
  freeDays: ["SA"],
  priority: "late",
  maxCourses: 7,
  allowPartial: true,
};

/** Periodo academico de los datos cargados. Se muestra en la UI y en el export. */
export const PERIOD_LABEL = "2026-II";

export const EXCEL_COURSES_FILE = "/data/CARGA HORARIA PRELIMINAR 2026 - II.xlsx";
export const EXCEL_TEACHERS_FILE = "/data/Tabla de Encuesta Docente en Excel.xlsx";
export const EXCEL_CURRICULUM_FILE = "/data/malla_curricular_uni.xlsx";

