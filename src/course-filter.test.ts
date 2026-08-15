import { describe, expect, it } from "vitest";
import { filterCourses, type CourseFilters, type CourseLookup } from "./course-filter";
import type { CurriculumCourse } from "./types";

const CATALOG: Record<string, { code: string; malla: CurriculumCourse | null }> = {
  "CALCULO DIFERENCIAL": {
    code: "BMA01",
    malla: { codigo: "BMA01", nombre: "CALCULO DIFERENCIAL", creditos: 5, tipo: "Obligatorio", ciclo: 1, prereqs: [] },
  },
  "GESTION DE PROYECTOS": {
    code: "GE116",
    malla: { codigo: "GE116", nombre: "GESTION DE PROYECTOS", creditos: 3, tipo: "Electivo", ciclo: null, prereqs: [] },
  },
  ERGONOMIA: {
    code: "TE121",
    malla: { codigo: "TE121", nombre: "ERGONOMIA", creditos: 3, tipo: "Complementario", ciclo: null, prereqs: [] },
  },
  "GESTION DE LA ENERGIA": {
    code: "TE124",
    malla: { codigo: "TE124", nombre: "GESTION DE LA ENERGIA", creditos: 3, tipo: "Complementario", ciclo: null, prereqs: [] },
  },
  "PLANEAMIENTO ESTRATEGICO": {
    code: "GE801",
    malla: { codigo: "GE801", nombre: "PLANEAMIENTO ESTRATEGICO", creditos: 3, tipo: "Obligatorio", ciclo: 8, prereqs: [] },
  },
  // Curso de otra carrera: ofertado, pero fuera de la malla de Industrial.
  CIBERSEGURIDAD: { code: "SI155", malla: null },
};

const names = Object.keys(CATALOG).sort();

const lookup: CourseLookup = {
  code: (c) => CATALOG[c]?.code ?? "",
  malla: (c) => CATALOG[c]?.malla ?? null,
};

const base: CourseFilters = {
  query: "",
  mode: "all",
  cycle: "",
  kind: "",
  recommended: new Set(["CALCULO DIFERENCIAL"]),
  selected: new Set(["ERGONOMIA"]),
};

const run = (overrides: Partial<CourseFilters> = {}) =>
  filterCourses(names, { ...base, ...overrides }, lookup);

describe("filterCourses", () => {
  it("sin filtros devuelve todo", () => {
    expect(run()).toHaveLength(names.length);
  });

  it("filtra por tipo electivo", () => {
    expect(run({ kind: "Electivo" })).toEqual(["GESTION DE PROYECTOS"]);
  });

  it("filtra por tipo complementario", () => {
    expect(run({ kind: "Complementario" })).toEqual(["ERGONOMIA", "GESTION DE LA ENERGIA"]);
  });

  it("filtra por ciclo", () => {
    expect(run({ cycle: "8" })).toEqual(["PLANEAMIENTO ESTRATEGICO"]);
  });

  it("busca por nombre", () => {
    expect(run({ query: "gestion" })).toEqual(["GESTION DE LA ENERGIA", "GESTION DE PROYECTOS"]);
  });

  it("busca por codigo de curso", () => {
    expect(run({ query: "te124" })).toEqual(["GESTION DE LA ENERGIA"]);
  });

  it("ignora mayusculas y espacios sobrantes en la busqueda", () => {
    expect(run({ query: "  ErGoNo " })).toEqual(["ERGONOMIA"]);
  });

  it("acumula busqueda y tipo", () => {
    // Este es el caso que pidio el usuario: buscar y filtrar a la vez.
    expect(run({ query: "gestion", kind: "Complementario" })).toEqual(["GESTION DE LA ENERGIA"]);
  });

  it("acumula busqueda, tipo y ciclo", () => {
    expect(run({ query: "planeamiento", kind: "Obligatorio", cycle: "8" })).toEqual([
      "PLANEAMIENTO ESTRATEGICO",
    ]);
    expect(run({ query: "planeamiento", kind: "Obligatorio", cycle: "1" })).toEqual([]);
  });

  it("excluye de los filtros de malla los cursos de otras carreras", () => {
    expect(run({ query: "ciber" })).toEqual(["CIBERSEGURIDAD"]);
    expect(run({ query: "ciber", kind: "Obligatorio" })).toEqual([]);
    expect(run({ query: "ciber", cycle: "1" })).toEqual([]);
  });

  it("no filtra por ciclo a electivos y complementarios, que no tienen ciclo", () => {
    expect(run({ cycle: "1" })).toEqual(["CALCULO DIFERENCIAL"]);
  });

  it("respeta la pestana de recomendados", () => {
    expect(run({ mode: "recommended" })).toEqual(["CALCULO DIFERENCIAL"]);
  });

  it("respeta la pestana de seleccionados", () => {
    expect(run({ mode: "selected" })).toEqual(["ERGONOMIA"]);
  });

  it("combina pestana con filtros de malla", () => {
    expect(run({ mode: "selected", kind: "Complementario" })).toEqual(["ERGONOMIA"]);
    expect(run({ mode: "selected", kind: "Electivo" })).toEqual([]);
  });
});
