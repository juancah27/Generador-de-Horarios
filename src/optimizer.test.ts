import { describe, expect, it } from "vitest";
import { runOptimizer, runOptimizerVariants } from "./optimizer";
import type { CoursesData, OptimizerReport, ScheduleParams, TeacherScores } from "./types";

const params: ScheduleParams = {
  ruleTT: 0,
  ruleTP: 0,
  minHour: 7,
  maxHour: 22,
  freeDays: [],
  priority: "balanced",
  maxCourses: 5,
  allowPartial: false,
};

const scores: TeacherScores = {
  "BUENO DOCENTE": 20,
  "REGULAR DOCENTE": 10,
};

const cls = (dia: string, inicio: number, fin: number) => ({ tipo: "T", dia, inicio, fin });

describe("runOptimizer", () => {
  it("retrocede sobre una eleccion buena para colocar mas cursos", () => {
    // La seccion mejor puntuada de A choca con la unica seccion de B.
    // Un optimizador greedy toma A1 y descarta B; el correcto toma A2 y coloca ambos.
    const data: CoursesData = {
      A: {
        "1": { docente: "BUENO, DOCENTE", codigo: "A01", clases: [cls("LU", 8, 10)] },
        "2": { docente: "REGULAR, DOCENTE", codigo: "A01", clases: [cls("LU", 10, 12)] },
      },
      B: {
        "1": { docente: "BUENO, DOCENTE", codigo: "B01", clases: [cls("LU", 8, 10)] },
      },
    };

    const report = runOptimizer(["A", "B"], data, scores, params);

    expect(Object.keys(report.placed).sort()).toEqual(["A", "B"]);
    expect(report.placed.A.secId).toBe("2");
    expect(report.dropped).toHaveLength(0);
  });

  it("reporta el curso descartado cuando ninguna combinacion entra", () => {
    const data: CoursesData = {
      A: { "1": { docente: "BUENO, DOCENTE", codigo: "A01", clases: [cls("LU", 8, 10)] } },
      B: { "1": { docente: "BUENO, DOCENTE", codigo: "B01", clases: [cls("LU", 8, 10)] } },
    };

    const report = runOptimizer(["A", "B"], data, scores, params);

    expect(Object.keys(report.placed)).toHaveLength(1);
    expect(report.dropped).toHaveLength(1);
    expect(report.dropped[0].reason).toContain("Bloqueado por");
  });

  it("respeta maxCourses", () => {
    const data: CoursesData = {
      A: { "1": { docente: "BUENO, DOCENTE", codigo: "A01", clases: [cls("LU", 8, 10)] } },
      B: { "1": { docente: "BUENO, DOCENTE", codigo: "B01", clases: [cls("MA", 8, 10)] } },
      C: { "1": { docente: "BUENO, DOCENTE", codigo: "C01", clases: [cls("MI", 8, 10)] } },
    };

    const report = runOptimizer(["A", "B", "C"], data, scores, { ...params, maxCourses: 2 });

    expect(Object.keys(report.placed)).toHaveLength(2);
  });

  it("informa las restricciones duras que dejan un curso sin seccion viable", () => {
    const data: CoursesData = {
      A: { "1": { docente: "BUENO, DOCENTE", codigo: "A01", clases: [cls("SA", 8, 10)] } },
    };

    const report = runOptimizer(["A"], data, scores, { ...params, freeDays: ["SA"] });

    expect(report.placed).toEqual({});
    expect(report.hardMisses).toHaveLength(1);
    expect(report.hardMisses[0].issues.join(" ")).toContain("Sabado");
  });

  it("prefiere el mejor docente cuando no hay choques", () => {
    const data: CoursesData = {
      A: {
        "1": { docente: "REGULAR, DOCENTE", codigo: "A01", clases: [cls("LU", 8, 10)] },
        "2": { docente: "BUENO, DOCENTE", codigo: "A01", clases: [cls("MA", 8, 10)] },
      },
    };

    const report = runOptimizer(["A"], data, scores, { ...params, priority: "teacher" });

    expect(report.placed.A.secId).toBe("2");
  });
});

describe("runOptimizerVariants", () => {
  /** Firma de docentes de un horario: lo que distingue una alternativa de otra. */
  const teachers = (report: OptimizerReport): string =>
    Object.values(report.placed)
      .map((s) => s.docente)
      .sort()
      .join("|");

  // Dos cursos sin cruces, con dos docentes distintos cada uno: 4 repartos posibles.
  const twoByTwo: CoursesData = {
    A: {
      "1": { docente: "BUENO, DOCENTE", codigo: "A01", clases: [cls("LU", 8, 10)] },
      "2": { docente: "REGULAR, DOCENTE", codigo: "A01", clases: [cls("LU", 10, 12)] },
    },
    B: {
      "1": { docente: "OTRO, DOCENTE", codigo: "B01", clases: [cls("MA", 8, 10)] },
      "2": { docente: "TERCERO, DOCENTE", codigo: "B01", clases: [cls("MA", 10, 12)] },
    },
  };

  it("devuelve alternativas con conjuntos de docentes distintos", () => {
    const variants = runOptimizerVariants(["A", "B"], twoByTwo, scores, params, { count: 4 });

    expect(variants.length).toBe(4);
    for (const v of variants) expect(Object.keys(v.placed).sort()).toEqual(["A", "B"]);
    expect(new Set(variants.map(teachers)).size).toBe(4);
  });

  it("nunca devuelve mas alternativas que las pedidas", () => {
    expect(runOptimizerVariants(["A", "B"], twoByTwo, scores, params, { count: 2 })).toHaveLength(2);
  });

  it("la primera alternativa es la que devuelve runOptimizer", () => {
    const first = runOptimizerVariants(["A", "B"], twoByTwo, scores, params, { count: 5 })[0];

    expect(first).toEqual(runOptimizer(["A", "B"], twoByTwo, scores, params));
  });

  it("respeta la seccion anclada en todas las alternativas", () => {
    const variants = runOptimizerVariants(["A", "B"], twoByTwo, scores, params, {
      count: 5,
      pinned: { A: "2" },
    });

    expect(variants.length).toBeGreaterThan(1);
    for (const v of variants) expect(v.placed.A.secId).toBe("2");
    // El curso libre si varia de docente entre alternativas.
    expect(new Set(variants.map((v) => v.placed.B.docente)).size).toBeGreaterThan(1);
  });

  it("mantiene un curso anclado aunque bloquee a otro", () => {
    const data: CoursesData = {
      A: { "1": { docente: "BUENO, DOCENTE", codigo: "A01", clases: [cls("LU", 8, 10)] } },
      B: { "1": { docente: "OTRO, DOCENTE", codigo: "B01", clases: [cls("LU", 8, 10)] } },
    };

    const [variant] = runOptimizerVariants(["A", "B"], data, scores, params, {
      count: 3,
      pinned: { B: "1" },
    });

    expect(Object.keys(variant.placed)).toEqual(["B"]);
    expect(variant.dropped.map((d) => d.course)).toEqual(["A"]);
  });

  it("ancla una seccion que rompe una restriccion dura", () => {
    const data: CoursesData = {
      A: {
        "1": { docente: "BUENO, DOCENTE", codigo: "A01", clases: [cls("SA", 8, 10)] },
        "2": { docente: "REGULAR, DOCENTE", codigo: "A01", clases: [cls("LU", 8, 10)] },
      },
    };

    const [variant] = runOptimizerVariants(["A"], data, scores, { ...params, freeDays: ["SA"] }, {
      count: 3,
      pinned: { A: "1" },
    });

    expect(variant.placed.A.secId).toBe("1");
  });

  it("da el mismo color a un curso en todas las alternativas", () => {
    const variants = runOptimizerVariants(["A", "B"], twoByTwo, scores, params, { count: 4 });

    for (const v of variants) expect(v.colorMap).toEqual(variants[0].colorMap);
    expect(variants[0].colorMap.A).not.toBe(variants[0].colorMap.B);
  });

  it("devuelve un reporte vacio cuando no hay nada que colocar", () => {
    expect(runOptimizerVariants(["NO EXISTE"], twoByTwo, scores, params, { count: 3 })).toHaveLength(1);
  });
});
