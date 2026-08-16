import type { CurriculumCourse } from "./types";

export type FilterMode = "all" | "selected";

export interface CourseFilters {
  /** Texto libre: matchea contra el nombre y contra el codigo del curso. */
  query: string;
  mode: FilterMode;
  /** Ciclo del plan como texto ("" = sin filtrar). */
  cycle: string;
  /** Tipo de curso ("" = sin filtrar). */
  kind: string;
  selected: Set<string>;
}

export interface CourseLookup {
  code(course: string): string;
  malla(course: string): CurriculumCourse | null;
}

/**
 * Aplica todos los filtros del catalogo. Se acumulan: buscar "gestion" con el
 * chip de Electivos y el ciclo 7 deja solo los electivos de ciclo 7 que
 * contengan "gestion".
 *
 * Los filtros de malla descartan los cursos que no estan en ella: la carga
 * horaria cubre varias carreras y la malla es de una sola.
 */
export function filterCourses(
  courses: string[],
  filters: CourseFilters,
  lookup: CourseLookup,
): string[] {
  const query = filters.query.trim().toLowerCase();

  return courses.filter((course) => {
    if (query) {
      const matches =
        course.toLowerCase().includes(query) || lookup.code(course).toLowerCase().includes(query);
      if (!matches) return false;
    }

    if (filters.mode === "selected" && !filters.selected.has(course)) return false;

    if (filters.cycle || filters.kind) {
      const malla = lookup.malla(course);
      if (!malla) return false;
      if (filters.cycle && String(malla.ciclo ?? "") !== filters.cycle) return false;
      if (filters.kind && malla.tipo !== filters.kind) return false;
    }

    return true;
  });
}
