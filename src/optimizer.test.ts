import { describe, expect, it } from "vitest";
import { runOptimizer } from "./optimizer";
import type { CoursesData, ScheduleParams, TeacherScores } from "./types";

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
