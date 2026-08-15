import { describe, expect, it } from "vitest";
import { normalizeParams } from "./params";
import { DEFAULT_PARAMS } from "./constants";

describe("normalizeParams", () => {
  it("cae a los valores por defecto con un objeto vacio", () => {
    expect(normalizeParams({})).toEqual(DEFAULT_PARAMS);
  });

  it("recorta las horas al rango permitido", () => {
    const p = normalizeParams({ minHour: 3, maxHour: 30 });
    expect(p.minHour).toBe(7);
    expect(p.maxHour).toBe(22);
  });

  it("no deja maxHour por debajo de minHour", () => {
    expect(normalizeParams({ minHour: 18, maxHour: 9 }).maxHour).toBe(18);
  });

  it("descarta dias libres invalidos y repetidos", () => {
    const p = normalizeParams({ freeDays: ["SA", "SA", "DO", "lu"] as never });
    expect(p.freeDays).toEqual(["SA", "LU"]);
  });

  it("rechaza una prioridad desconocida", () => {
    expect(normalizeParams({ priority: "loquesea" as never }).priority).toBe(DEFAULT_PARAMS.priority);
  });

  it("ignora numeros no finitos", () => {
    const p = normalizeParams({ ruleTT: NaN, maxCourses: Infinity });
    expect(p.ruleTT).toBe(DEFAULT_PARAMS.ruleTT);
    expect(p.maxCourses).toBe(DEFAULT_PARAMS.maxCourses);
  });

  it("acepta booleanos guardados como texto", () => {
    expect(normalizeParams({ allowPartial: "false" as never }).allowPartial).toBe(false);
    expect(normalizeParams({ allowPartial: "true" as never }).allowPartial).toBe(true);
  });
});
