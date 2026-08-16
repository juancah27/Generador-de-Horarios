import type { DayCode, ScheduleParams } from "./types";

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
 * Espeja el `--c` de las clases `.color-N` de styles.css: si cambia una lista
 * hay que cambiar la otra, y `tokens.test.ts` verifica que coincidan.
 */
export const DOT_COLORS = [
  "#e94ba0",
  "#22d3ee",
  "#f5b31b",
  "#8b5cf6",
  "#10b981",
  "#4c8dff",
  "#fb7534",
  "#14b8a6",
  "#fb7185",
  "#7c6cff",
  "#84cc16",
  "#38bdf8",
  "#d946ef",
  "#f59e0b",
];

export const T_TYPES = ["T"];
export const P_TYPES = ["P", "PRA", "PC", "LAB"];

/**
 * Estado base: no descarta ninguna seccion de entrada. `minHour`/`maxHour` y
 * `freeDays` son restricciones duras (`hardViolationsForSection`), asi que
 * arrancan cubriendo toda la franja de la carga horaria (8:00-22:00, sabado
 * incluido). Restringir es decision del usuario, no punto de partida.
 */
export const DEFAULT_PARAMS: ScheduleParams = {
  ruleTT: 4,
  ruleTP: 2,
  minHour: 8,
  maxHour: 22,
  freeDays: [],
  priority: "balanced",
  maxCourses: 7,
  allowPartial: true,
};

/** Periodo academico de los datos cargados. Se muestra en la UI y en el export. */
export const PERIOD_LABEL = "2026-II";

export const EXCEL_COURSES_FILE = "/data/CARGA HORARIA PRELIMINAR 2026 - II.xlsx";
export const EXCEL_TEACHERS_FILE = "/data/Tabla de Encuesta Docente en Excel.xlsx";
export const EXCEL_CURRICULUM_FILE = "/data/malla_curricular_uni.xlsx";

