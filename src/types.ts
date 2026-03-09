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

export interface AppState {
  coursesData: CoursesData;
  teacherScores: TeacherScores;
  selected: Record<string, SectionData>;
  colorMap: Record<string, string>;
  colorIdx: number;
  filter: "all" | "recommended" | "selected";
  searchQ: string;
  params: ScheduleParams;
  panelState: {
    sidebar: boolean;
    summary: boolean;
  };
}
