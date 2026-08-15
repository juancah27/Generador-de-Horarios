import { describe, expect, it } from "vitest";
import {
  causesViolation,
  classifyClash,
  getViolators,
  hardViolationsForSection,
  overlapH,
} from "./conflicts";
import { DEFAULT_PARAMS } from "./constants";
import type { ClassEntry, ScheduleParams, SectionData } from "./types";

const params: ScheduleParams = {
  ...DEFAULT_PARAMS,
  ruleTT: 2,
  ruleTP: 1,
  minHour: 8,
  maxHour: 22,
  freeDays: [],
  allowPartial: true,
};

const c = (tipo: string, dia: string, inicio: number, fin: number): ClassEntry => ({
  tipo,
  dia,
  inicio,
  fin,
});

const sec = (clases: ClassEntry[]): SectionData => ({ docente: "X, Y", codigo: "C01", clases });

describe("overlapH", () => {
  it("mide el solape en horas", () => {
    expect(overlapH(8, 12, 10, 14)).toBe(2);
  });

  it("da 0 cuando solo se tocan los bordes", () => {
    expect(overlapH(8, 10, 10, 12)).toBe(0);
  });

  it("da 0 cuando no hay interseccion", () => {
    expect(overlapH(8, 10, 14, 16)).toBe(0);
  });
});

describe("classifyClash", () => {
  it("ignora dias distintos", () => {
    expect(classifyClash(c("T", "LU", 8, 10), c("T", "MA", 8, 10), params)).toBeNull();
  });

  it("tolera un cruce T/T dentro del limite", () => {
    const r = classifyClash(c("T", "LU", 8, 12), c("T", "LU", 10, 14), params);
    expect(r?.kind).toBe("TT");
    expect(r?.ov).toBe(2);
    expect(r?.violated).toBe(false);
  });

  it("marca violacion cuando el cruce T/T pasa el limite", () => {
    const r = classifyClash(c("T", "LU", 8, 12), c("T", "LU", 9, 14), params);
    expect(r?.ov).toBe(3);
    expect(r?.violated).toBe(true);
  });

  it("prohibe siempre P/P sin importar los parametros", () => {
    const r = classifyClash(c("P", "LU", 8, 10), c("LAB", "LU", 9, 11), { ...params, ruleTT: 8 });
    expect(r?.kind).toBe("PP");
    expect(r?.maxOk).toBe(0);
    expect(r?.violated).toBe(true);
  });

  it("con allowPartial en false cualquier cruce viola", () => {
    const r = classifyClash(c("T", "LU", 8, 12), c("T", "LU", 11, 14), {
      ...params,
      allowPartial: false,
    });
    expect(r?.ov).toBe(1);
    expect(r?.violated).toBe(true);
  });

  it("trata T contra P como T/P", () => {
    const r = classifyClash(c("T", "LU", 8, 10), c("LAB", "LU", 9, 11), params);
    expect(r?.kind).toBe("TP");
    expect(r?.maxOk).toBe(1);
    expect(r?.violated).toBe(false);
  });
});

describe("hardViolationsForSection", () => {
  it("detecta inicio antes del minimo y fin despues del maximo", () => {
    const issues = hardViolationsForSection(sec([c("T", "LU", 7, 23)]), params);
    expect(issues).toHaveLength(2);
    expect(issues.join(" ")).toContain("7h");
    expect(issues.join(" ")).toContain("23h");
  });

  it("detecta clases en un dia marcado como libre", () => {
    const issues = hardViolationsForSection(sec([c("T", "SA", 9, 11)]), {
      ...params,
      freeDays: ["SA"],
    });
    expect(issues.join(" ")).toContain("Sabado");
  });

  it("no repite el mismo aviso dos veces", () => {
    const issues = hardViolationsForSection(sec([c("T", "LU", 7, 9), c("P", "LU", 7, 9)]), params);
    expect(issues).toHaveLength(1);
  });

  it("no reporta nada para una seccion valida", () => {
    expect(hardViolationsForSection(sec([c("T", "LU", 9, 11)]), params)).toEqual([]);
  });
});

describe("causesViolation", () => {
  const ya = { A: sec([c("T", "LU", 8, 10)]) };

  it("es true si choca con lo ya elegido", () => {
    expect(causesViolation("B", sec([c("P", "LU", 8, 10)]), ya, params)).toBe(true);
  });

  it("es false si no choca", () => {
    expect(causesViolation("B", sec([c("T", "MA", 8, 10)]), ya, params)).toBe(false);
  });

  it("no se compara consigo mismo al cambiar de seccion", () => {
    expect(causesViolation("A", sec([c("T", "LU", 8, 10)]), ya, params)).toBe(false);
  });
});

describe("getViolators", () => {
  it("marca ambos lados de un cruce invalido", () => {
    const bad = getViolators({ A: sec([c("P", "LU", 8, 10)]), B: sec([c("P", "LU", 9, 11)]) }, params);
    expect(bad).toEqual(new Set(["A", "B"]));
  });

  it("marca una seccion que rompe una restriccion dura", () => {
    const bad = getViolators({ A: sec([c("T", "LU", 7, 9)]) }, params);
    expect(bad).toEqual(new Set(["A"]));
  });

  it("no marca nada si todo esta bien", () => {
    const bad = getViolators({ A: sec([c("T", "LU", 8, 10)]), B: sec([c("T", "MA", 8, 10)]) }, params);
    expect(bad.size).toBe(0);
  });
});
