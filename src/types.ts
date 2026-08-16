export type DayCode = "LU" | "MA" | "MI" | "JU" | "VI" | "SA";

export type PriorityMode = "balanced" | "teacher" | "freedays" | "compact" | "late";

export interface ClassEntry {
  tipo: string;
  dia: DayCode | string;
  inicio: number;
  fin: number;
}

export interface SectionData {
  docente: string;
  codigo: string;
  clases: ClassEntry[];
  secId?: string;
}

export type SectionsById = Record<string, SectionData>;
export type CoursesData = Record<string, SectionsById>;
export type TeacherScores = Record<string, number>;

export interface ScheduleParams {
  ruleTT: number;
  ruleTP: number;
  minHour: number;
  maxHour: number;
  freeDays: DayCode[];
  priority: PriorityMode;
  maxCourses: number;
  allowPartial: boolean;
}

export interface ClashResult {
  ov: number;
  kind: "TT" | "TP" | "PP";
  maxOk: number;
  violated: boolean;
  c1: ClassEntry;
  c2: ClassEntry;
}

export interface OptimizerReport {
  placed: Record<string, SectionData>;
  dropped: Array<{ course: string; reason: string; checked: number }>;
  hardMisses: Array<{ course: string; issues: string[] }>;
  colorMap: Record<string, string>;
  colorIdx: number;
}

export type CourseKind = "Obligatorio" | "Electivo" | "Complementario";

export interface CurriculumCourse {
  codigo: string;
  nombre: string;
  creditos: number;
  tipo: CourseKind;
  /** Ciclo del plan (1-10). Null en electivos y complementarios, que son libres. */
  ciclo: number | null;
  prereqs: Array<{ codigo: string; nombre: string }>;
}

export interface GradeRequirement {
  tipo: string;
  creditosMinimos: number;
  observacion: string;
}

export interface Curriculum {
  byCode: Record<string, CurriculumCourse>;
  requirements: GradeRequirement[];
  cycles: number[];
}
