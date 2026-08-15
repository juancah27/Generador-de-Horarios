import { describe, expect, it } from "vitest";
import { clamp, escapeHtml, normalizeCourseName, normalizeDay, normalizeTeacherName, parseHour } from "./utils";

describe("normalizeDay", () => {
  it("acepta las variantes que aparecen en el Excel", () => {
    for (const raw of ["LU", "lun", "Lunes", " LU ", "LUNES"]) {
      expect(normalizeDay(raw)).toBe("LU");
    }
  });

  it("resuelve dias con tilde", () => {
    expect(normalizeDay("Miércoles")).toBe("MI");
    expect(normalizeDay("Sábado")).toBe("SA");
  });

  it("devuelve vacio para basura", () => {
    expect(normalizeDay("DOMINGO")).toBe("");
    expect(normalizeDay("")).toBe("");
  });
});

describe("parseHour", () => {
  it("lee horas enteras", () => {
    expect(parseHour(9)).toBe(9);
    expect(parseHour("14")).toBe(14);
  });

  it("lee el formato HH:MM", () => {
    expect(parseHour("16:00")).toBe(16);
  });

  it("convierte la fraccion de dia que usa Excel para las horas", () => {
    expect(parseHour(0.75)).toBe(18);
  });

  it("devuelve null para valores vacios o no numericos", () => {
    expect(parseHour("")).toBeNull();
    expect(parseHour(null)).toBeNull();
    expect(parseHour("N/A")).toBeNull();
  });
});

describe("normalizeTeacherName", () => {
  it("quita comas, guiones, tildes y espacios de mas", () => {
    expect(normalizeTeacherName("  Campana-Añasco,  Rildo ")).toBe("CAMPANA ANASCO RILDO");
  });
});

describe("normalizeCourseName", () => {
  it("normaliza para comparar nombres del Excel", () => {
    expect(normalizeCourseName(" Automatización  y Control ")).toBe("AUTOMATIZACION Y CONTROL");
  });
});

describe("escapeHtml", () => {
  it("escapa los caracteres que rompen el marcado", () => {
    expect(escapeHtml('A & B <c> "d"')).toBe("A &amp; B &lt;c&gt; &quot;d&quot;");
  });

  it("trata null y undefined como vacio", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("clamp", () => {
  it("recorta a los extremos", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
